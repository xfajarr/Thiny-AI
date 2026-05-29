# Thiny — Architecture

Thiny combines two established patterns into a kernel you can read in one sitting.

---

## 1. The big picture: microkernel + hexagonal

**Microkernel** — the core provides _mechanism only_ (a loop, a registry, an event bus, a plugin loader). All _capability_ lives in plugins. Like VS Code or the Linux kernel.

**Hexagonal (Ports & Adapters)** — the core defines _interfaces_ (ports) for everything it depends on and never imports a concrete implementation. Adapters satisfy those ports.

**The dependency rule: arrows only point inward.**

```
              ┌──── HEADS (transports) ────┐
              │  CLI  │  HTTP  │  Daemon   │
              └───┬───┴───┬────┴─────┬─────┘
                  ▼       ▼          ▼
        ╔══════════════════════════════════╗
        ║           THE KERNEL             ║
        ║  Agent Loop  →  Tool Registry    ║
        ║       │ via composed middleware  ║
        ║       ▼                          ║
        ║  ModelProvider  MemoryBackend    ║  ← PORTS (interfaces only)
        ║  Signer         Logger           ║
        ╚═════════△════════△═══════════════╝
                  │        │ implements
        ┌─────────┴────────┴────────────────┐
        │  ADAPTERS + PLUGINS               │
        │  ai-sdk · sqlite · viem · solana  │
        └───────────────────────────────────┘
```

**Core imports nothing concrete.** `@thiny/core` depends only on its own ports and Zod. No OpenAI, no viem, no database.

---

## 2. The system layers

| Layer            | Files                                                            | Responsibility                         |
| ---------------- | ---------------------------------------------------------------- | -------------------------------------- |
| **0 — Domain**   | `src/domain/`                                                    | Pure data types, no deps               |
| **1 — Kernel**   | `loop.ts`, `registry.ts`, `compose.ts`, `plugin.ts`, `events.ts` | Orchestration mechanism                |
| **2 — Ports**    | `ports.ts`, `signer.ts`                                          | Interfaces the core owns               |
| **3 — Adapters** | `packages/adapters/*`                                            | Concrete port implementations          |
| **3 — Plugins**  | `packages/plugins/*`                                             | Domain capability (tools + middleware) |
| **4 — Heads**    | `heads/*`                                                        | Transports (CLI, HTTP, daemon)         |

---

## 3. The domain model

Five types, everything is built from them:

```ts
type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}
interface Usage {
  inputTokens: number;
  outputTokens: number;
}
interface ModelResponse {
  text?: string;
  toolCalls?: ToolCall[];
  finishReason: FinishReason;
  usage?: Usage;
}
```

`Message[]` is the agent's working state. The whole loop grows it until the model stops calling tools.

---

## 4. The agent loop (ReAct)

The heart of the kernel — Think → Act → Observe, repeat:

```
seed messages (system prompt + history)
push user input

for step in 0..maxSteps:                       ① circuit breaker
  res = generate(messages, tools)              ② THINK
  push assistant(res.text, res.toolCalls)

  if no toolCalls: return res.text             ③ DONE — model decided

  results = parallel for each toolCall:        ④ ACT
    args = Zod.parse(call.args)                ⑤ validate untrusted LLM JSON
    try execute(args) else "ERROR: ..."        ⑥ error-as-observation

  push tool results                            ⑦ OBSERVE → loop back

throw MaxStepsError
```

Seven invariants to internalize — that's the entire theory of agents.

---

## 5. The tool contract

Tools are the primary extension point. Define one with `defineTool`:

```ts
defineTool({
  name: "web_search",          // unique, snake_case, namespaced by domain
  description:                 // ← the LLM reads THIS to decide when to call
    "Search the web and return top results. Use for current events and facts.",
  parameters: z.object({       // Zod = runtime validation + JSON schema for the LLM
    query: z.string(),
    count: z.number().int().min(1).max(10).default(5),
  }),
  sensitive: false,            // true → policy defaults to "approve" (for money/destructive ops)
  execute: async (args, ctx) => {
    // args is already validated and typed
    // ctx gives you: model, memory, tools, events, logger, state, signer?, approver?, spawn?
    return { results: [...] }; // must be JSON-serialisable
  },
});
```

---

## 6. The middleware pipeline (the onion)

Cross-cutting concerns wrap the loop in composable layers. Two seams:

```ts
// Wraps model.generate — for anything about the LLM call
type ModelMiddleware = (req: ModelRequest, next: ModelNext) => Promise<ModelResponse>;

// Wraps tool execution — for authorization, audit, rate-limits
type ToolMiddleware = (call: ToolCallCtx, next: ToolNext) => Promise<unknown>;
```

Composed outside-in (`reduceRight`) so the first middleware in the array wraps everything:

```
request → [audit → budget → compaction → MODEL → ] → response   (model side)
call    → [audit → policy → approval   → TOOL  → ] → result     (tool side)
```

To **deny**, throw before calling `next` — the loop turns it into an observation.

**Middleware invariant for streaming:** the streaming base sits _inside_ `composeModel(...)` so budget/audit/compaction still apply. Streaming changes delivery only.

---

## 7. Safety architecture

The governing rule: **the LLM is an untrusted planner. It proposes; deterministic, non-AI code enforces.**

| Threat                  | Control                                                           | Where                          |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------ |
| Prompt injection        | Zod-validate at boundary; policy never reads model text           | `loop.ts:⑤`, `policy.ts`       |
| Over-privileged actions | `sensitive: true` → default "approve"; least-privilege tool sets  | `tool.ts`, `policy.ts`         |
| Fund loss               | Value caps + destination allowlists + testnet-only default        | EVM/Solana policy rules        |
| Key custody             | `Signer` port; mainnet guard refuses real signing unless opted in | `signer-viem`, `signer-circle` |
| Runaway cost            | Token/$ budget + max-steps circuit breaker                        | `budget.ts`, `loop.ts:①`       |
| Unattended autonomy     | Headless deny-by-default approver, overlap guard, `maxRuns`       | `approvers.ts`, `runtime`      |
| Auditability            | Immutable structured log of every model + tool call               | `audit.ts` (pino)              |

**Policy vs prompt:** caps and allowlists live in `PolicyRule` (code), never in the system prompt. "Please don't spend more than X" is not a control.

---

## 8. The plugin system

```ts
interface Plugin {
  name: string;
  tools?: Tool[];
  memory?: MemoryBackend; // replace the memory backend
  modelMiddleware?: ModelMiddleware[]; // wrap every LLM call
  toolMiddleware?: ToolMiddleware[]; // wrap every tool execution
  setup?(ctx: Ctx): Promise<void>; // runs AFTER all plugins register
}
```

Loaded in **two phases**:

1. **Register** — collect tools, middleware, memory.
2. **Setup** — each plugin's `setup(ctx)` runs with the fully-populated registry, so plugins can find each other's services.

---

## 9. The context object

Threaded through the loop and every `execute(args, ctx)`:

```ts
interface Ctx {
  sessionId: string;
  model: ModelProvider;
  memory: MemoryBackend;
  tools: ToolRegistry;
  events: EventBus;
  logger: Logger;
  state: Map<string, unknown>; // per-run scratch space shared between tools
  signer?: Signer;
  approver?: Approver;
  spawn?: Spawn; // run a scoped child agent (delegation)
  maxSteps: number;
}
```

Your tool should only use what it actually needs. `ctx.logger` over `console`. `ctx.state` for sharing data between tools within one run. `ctx.signer` only after a null-check with a clear error.

---

## 10. Key design decisions

| Decision                                              | Rationale                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Hand-build the kernel, AI SDK only for the model port | Maximum comprehension + isolated provider coupling                                 |
| Zod for tool parameters                               | Runtime validation + automatic JSON schema for the model — one source of truth     |
| Errors-as-observations                                | Failed tool calls become observations so the model can recover instead of crashing |
| Two-phase plugin loader                               | Plugins can depend on each other without explicit ordering                         |
| Streaming inside middleware                           | All safety gates apply to streaming and blocking paths equally                     |
| Testnet-only by default                               | `viemSigner` throws unless `allowMainnet: true` — safe default                     |

---

## 11. Dependency graph

```
heads/cli ──────────────────────────────────▶ @thiny/core
                                             ▲
@thiny/model-aisdk ──────────────────────────┤
@thiny/plugin-web-search ────────────────────┤
@thiny/plugin-evm ───────────────────────────┤
@thiny/memory-sqlite ────────────────────────┤
@thiny/runtime ──────────────────────────────┘

All arrows point to @thiny/core.
@thiny/core depends only on zod.
No plugin or adapter imports another plugin or adapter.
```
