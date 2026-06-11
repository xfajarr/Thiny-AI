# Thiny

**The thin, tiny core for AI agents with Web2 tools and Web3 actions.**

A lightweight, plugin-based TypeScript microkernel for building production-ready AI agents. One kernel, any LLM, any chain.

```bash
npm create thiny@latest my-agent
# or with plugins:
pnpm create-thiny my-agent --plugins web-search,evm
```

---

## Why Thiny?

Most agent frameworks are built to _run a product_. Thiny is built for developers who build agents **repeatedly** — at hackathons, in prototypes, in production tools:

- **Tiny by default.** The kernel is ~600 LOC. Read it in one sitting.
- **Any LLM, any provider.** OpenAI, Anthropic, Ollama, Groq, Mimo, any OpenAI-compatible API — just set a base URL.
- **Web2 + Web3 from one core.** REST APIs and on-chain actions share the same plugin contract.
- **Production safety built in.** Deterministic policy engine, approval gates, budget circuit breakers — opt-in middleware, not afterthoughts.
- **Sessions, memory, personas.** Users get their own persistent sessions and the agent learns across conversations.

---

## Quick start (Web2)

```bash
git clone https://github.com/getthiny/thiny && cd thiny
pnpm install && cp .env.example .env   # add THINY_OPENAI_API_KEY
pnpm cli
```

Or scaffold a new project in < 1 minute:

```bash
pnpm create-thiny my-bot --plugins web-search
cd my-bot && cp .env.example .env && pnpm install && pnpm agent "search for AI news"
```

---

## Quick start (Web3 / on-chain)

```bash
pnpm create-thiny my-defi-bot --plugins evm,solana
cd my-defi-bot && cp .env.example .env
# Set EVM_RPC_URL, AGENT_PRIVATE_KEY in .env
pnpm agent "What is my Sepolia ETH balance?"
```

Policy engine + approval gate protect every sensitive action:

```ts
import {
  createAgent,
  evmPlugin,
  evmTransferRules,
  policyMiddleware,
  pinoLogger,
} from "@thiny/agent";

const agent = await createAgent({
  model: loadThinyConfig(),
  plugins: [
    evmPlugin({ publicClient, chainId: 11155111, isTestnet: true, signer }),
    {
      name: "policy",
      toolMiddleware: [
        policyMiddleware(
          evmTransferRules({
            maxValueWei: 10_000_000_000_000_000n, // 0.01 ETH cap
            allowlist: [process.env.RECIPIENT!], // destination allowlist
          }),
        ),
      ],
    },
  ],
});
```

---

## Any LLM — no prefix needed

```bash
# Mimo by Xiaomi
THINY_MODEL=mimo-v2.5-pro
THINY_OPENAI_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1
THINY_OPENAI_API_KEY=your-key

# Ollama (local, free)
THINY_MODEL=llama3
THINY_OPENAI_BASE_URL=http://localhost:11434/v1

# Groq (fast)
THINY_MODEL=llama-3.1-70b-versatile
THINY_OPENAI_BASE_URL=https://api.groq.com/openai/v1
THINY_OPENAI_API_KEY=gsk_...
```

Just set the model name and base URL — no `openai-compat:` prefix required.

---

## Custom agent identity (persona)

```bash
THINY_PERSONA_NAME=ThinyAI
THINY_PERSONA_DESCRIPTION=a helpful AI assistant built on the Thiny framework
```

Every LLM will now identify itself as ThinyAI, regardless of the underlying model.

---

## Cross-session user memory

```ts
import { userMemoryPlugin, finalizeSession } from "@thiny/plugin-user-memory";

const agent = await createAgent({
  memory,
  plugins: [userMemoryPlugin({ userId: "user-42", backend: memory })],
});

// After each session ends, extract and store learnings:
await finalizeSession({ model, backend: memory, userId: "user-42", sessionId });
// Next session automatically loads: facts, preferences, session summaries
```

---

## What's in Thiny

| Package                     | Description                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@thiny/core`               | Microkernel: ReAct loop, tool registry, plugin system, middleware (audit, budget, policy, compaction, identity), spawn |
| `@thiny/agent`              | Batteries-included barrel — one import for everything                                                                  |
| `@thiny/model-aisdk`        | Vercel AI SDK adapter: any OpenAI-compatible or Anthropic endpoint, streaming, dynamic config                          |
| `@thiny/logger-pino`        | Structured pino logger behind the Logger port                                                                          |
| `@thiny/memory-sqlite`      | SQLite-backed session persistence (libsql)                                                                             |
| `@thiny/plugin-web-search`  | Brave Search API — Web2 tool plugin                                                                                    |
| `@thiny/plugin-evm`         | EVM read tools + gated testnet send + `evmTransferRules` policy                                                        |
| `@thiny/plugin-solana`      | Solana read tools + gated devnet send + `solanaTransferRules` policy                                                   |
| `@thiny/plugin-user-memory` | Cross-session user memory: facts, preferences, session summaries                                                       |
| `@thiny/signer-viem`        | viem-based transaction signer with mainnet guard                                                                       |
| `@thiny/eval`               | Deterministic eval harness: `scriptModel` + `runEval` — no API key needed                                              |
| `@thiny/runtime`            | Autonomous scheduler: interval + cron jobs, no-overlap guard, `maxRuns` kill switch                                    |
| `@thiny/mcp`                | MCP stdio client: any MCP server becomes instant Thiny tools                                                           |
| `create-thiny`              | Project scaffolder — running agent in < 1 minute                                                                       |
| `heads/cli`                 | Interactive terminal agent with streaming                                                                              |
| `heads/http`                | SSE server + streaming browser chat UI                                                                                 |
| `heads/daemon`              | Headless autonomous agent with graceful shutdown                                                                       |

---

## Available scripts

```bash
pnpm cli          # interactive terminal chat (streaming, SQLite sessions)
pnpm http         # browser chat at http://localhost:8787
pnpm daemon       # autonomous heartbeat agent
pnpm create-thiny my-project --plugins web-search,evm   # scaffold new agent
pnpm test         # 116 tests
pnpm test:coverage  # coverage report (≥ 80%)
pnpm lint         # ESLint strict
```

---

## Documentation

| Doc                                          | Contents                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| [docs/QUICKSTART.md](docs/QUICKSTART.md)     | 6-step walkthrough from clone to running agent                                |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Microkernel + hexagonal design, ReAct loop, middleware pipeline, safety model |
| [docs/PLUGINS.md](docs/PLUGINS.md)           | Full plugin authoring guide with security contract                            |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | How to add a plugin, run tests, open a PR                                     |
| [ROADMAP.md](ROADMAP.md)                     | Milestone overview (M1 Web2 ✅, M2 Web3 ✅, M3 ecosystem)                     |

---

## License

MIT — see [LICENSE](LICENSE)

## Production readiness

Tracked in [`PRODUCTION_READINESS_PLAN.md`](./PRODUCTION_READINESS_PLAN.md) with 14 tickets across 5 milestones.

- **P1 Publishable** — package metadata, READMEs, export validation, provenance
- **P2 Safe** — hardened HTTP head, secret redaction, threat model
- **P3 Observable** — OpenTelemetry, health probes
- **P4 Stable** — API contract, trust-boundary coverage, docs site
- **P5 Governed** — supply-chain CI, governance docs
