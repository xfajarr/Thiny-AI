# Thiny — Roadmap to Complete

> Current state: 2026-05-30. This document is the single source of truth for what remains.
> Implementation details (TDD steps, full code) live in `thiny-implementation-plan.md`.

---

## What is already done

| Package                    | Status      | Notes                                                                                                                                               |
| -------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@thiny/core`              | ✅ Complete | domain, ports, loop, registry, events, plugin system, middleware (audit/budget/policy/compaction), compose, stream, approvers, spawn, agent factory |
| `@thiny/model-aisdk`       | ✅ Complete | `generate` + `stream`, `aiSdkModel`, `modelFromEnv`, `loadThinyConfig`, dynamic provider config                                                     |
| `@thiny/logger-pino`       | ✅ Complete | pretty dev / JSON prod / file sink                                                                                                                  |
| `@thiny/plugin-web-search` | ✅ Complete | Brave Search, injectable fetch                                                                                                                      |
| `heads/cli`                | ✅ Complete | interactive terminal, streaming, pino, plugin wiring                                                                                                |
| Dev tooling                | ✅ Complete | ESLint strict, Prettier, Husky, lint-staged, Changesets, coverage, VS Code, GitHub templates                                                        |
| Docs                       | ✅ Complete | README, QUICKSTART, ARCHITECTURE, PLUGINS                                                                                                           |

**35 tests passing. Lint clean. Typecheck clean.**

---

## Definition of "Thiny complete"

Three milestones, each independently shippable:

| Milestone                     | What it unlocks                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1 — Kernel complete**      | The reusable hackathon core is fully usable: persists sessions, has a one-command scaffolder, has a demoable web UI, and can be regression-tested. |
| **M2 — Web3 stack**           | The agent reads + writes on EVM and Solana testnets with deterministic safety. Capable for on-chain hackathons.                                    |
| **M3 — Autonomy + ecosystem** | Always-on runtime, MCP integration, resilience, RAG. The agent can run unattended and integrate with the broader MCP ecosystem.                    |

---

## Milestone 1 — Kernel complete

> Goal: ship M1 before the next hackathon.

### Phase 1 — `@thiny/memory-sqlite` (session persistence)

**Why now:** `createAgent` falls back to in-memory storage — sessions vanish on restart. This is the single most painful gap for any real usage.

**Package:** `packages/adapters/memory-sqlite/`
**Deps:** `@libsql/client@^0.6`

Tasks:

- [ ] `sqliteMemory({ url })` factory — creates the `transcripts` table, returns a `MemoryBackend`
- [ ] `load(sessionId)` — reads full JSON transcript
- [ ] `append(sessionId, messages)` — upserts (replaces the full transcript)
- [ ] Tests: round-trip, multi-session isolation, append-replaces — all against `:memory:` libsql
- [ ] Wire into CLI: `memory: await sqliteMemory({ url: "file:thiny.sqlite" })`
- [ ] Export from the package barrel; add `CHANGELOG.md` stub
- [ ] Add to `.env.example`: `SESSION_DB=file:thiny.sqlite`

**Implementation reference:** `thiny-implementation-plan.md` Phase 4 Task 4.1

---

### Phase 2 — `@thiny/agent` meta-package (batteries-included entry point)

**Why now:** Currently users need three imports. A meta-package makes the most common case one import and reduces onboarding friction.

**Package:** `packages/agent/`

```ts
// After this phase:
import { createAgent, pinoLogger, loadThinyConfig, webSearchPlugin } from "@thiny/agent";
```

Tasks:

- [ ] `packages/agent/package.json` — re-exports `@thiny/core`, `@thiny/model-aisdk`, `@thiny/logger-pino`; lists them as **peerDependencies** (so consumers control versions)
- [ ] `packages/agent/src/index.ts` — re-export everything from core + the most-used adapters
- [ ] `packages/agent/tsconfig.json`
- [ ] `packages/agent/CHANGELOG.md` stub
- [ ] Add to root `tsconfig.json` references
- [ ] Update README quickstart to use `@thiny/agent`
- [ ] Update QUICKSTART.md

---

### Phase 3 — `create-thiny` scaffolder

**Why now:** "Go from nothing to a running agent in < 1 minute" is the core promise. Without the scaffolder it's unfulfilled.

**Package:** `apps/create-thiny/`

Tasks:

- [ ] `planFiles({ name, plugins })` — generates `package.json`, `src/agent.ts`, `.env.example`, `thiny.config.json`
- [ ] `renderAgentFile` — uses `@thiny/agent` import, wires selected plugins
- [ ] CLI entrypoint `src/index.ts` — `npx create-thiny my-agent --plugins web-search,evm`
- [ ] Plugin registry: `web-search`, `evm`, `solana` (stubs OK for unavailable ones)
- [ ] Tests: `planFiles` generates correct files; plugin imports appear/don't appear
- [ ] Add root script: `"create-thiny": "node --import tsx apps/create-thiny/src/index.ts"`
- [ ] Update README with `npx create-thiny` example

**Implementation reference:** `thiny-implementation-plan.md` Phase 7

---

### Phase 4 — `@kernel/eval` harness

**Why now:** Pre-demo reliability. Run scripted scenarios with a deterministic `scriptModel` before touching a real API. Stops embarrassing live failures.

**Package:** `packages/eval/`

Tasks:

- [ ] `scriptModel(steps: ModelResponse[])` — deterministic `ModelProvider` that returns scripted responses in order
- [ ] `runEval(agent, scenarios)` — runs each scenario, asserts tool calls + final text
- [ ] `EvalResult { name, passed, reasons, final, toolCalls }`
- [ ] Requires: expose `agent.events` + `EventBus.off` (add `off` to `EventBus` in core — already partially done via `spawn.ts`)
- [ ] Tests: pass/fail/tool-assertion scenarios
- [ ] Export from barrel

**Implementation reference:** `thiny-implementation-plan.md` Phase 12

---

### Phase 5 — HTTP/SSE head + web UI

**Why now:** Hackathons are won on the demo. The CLI works but a browser chat makes it look like a product.

**Package:** `heads/http/`

Tasks:

- [ ] `sseMessage(payload)` — formats an SSE data frame
- [ ] `streamChat(agent, input, sessionId, write)` — drives `agent.run` with `onToken`, emits delta + done frames
- [ ] `src/web.ts` — one-file streaming chat UI (vanilla HTML + fetch SSE)
- [ ] `src/main.ts` — `node:http` server: `GET /` serves the UI, `POST /chat` streams SSE
- [ ] Tests: `sseMessage` format, `streamChat` delta/done sequence (no network)
- [ ] Root script: `"http": "node --env-file=.env --import tsx heads/http/src/main.ts"`
- [ ] `PORT=8787` env var

**Implementation reference:** `thiny-implementation-plan.md` Phase 11

---

## Milestone 2 — Web3 stack

> Goal: the agent can read + write on EVM and Solana testnets with full safety.

### Phase 6 — `@thiny/signer-viem` + `@thiny/plugin-evm`

**Package A:** `packages/adapters/signer-viem/`
**Package B:** `packages/plugins/evm/`
**Deps:** `viem@^2`

Tasks — signer:

- [ ] `viemSigner({ privateKey, chainId, rpcUrl, isTestnet, allowMainnet? })` — derives address, **throws if mainnet and `allowMainnet` is not `true`**
- [ ] `signAndSend(tx)` — broadcasts + waits for receipt
- [ ] Tests: address derivation, mainnet guard

Tasks — EVM plugin:

- [ ] `evm_get_balance` tool (native token, viem `getBalance`)
- [ ] `evm_read_contract` tool (`readContract`, BigInt → string)
- [ ] `evm_send_native` tool — `sensitive: true`, requires `ctx.signer.isTestnet`
- [ ] `evmTransferRules({ maxValueWei, allowlist })` — deterministic `PolicyRule[]`
- [ ] Tests: fake client for read tools, rules (deny/approve/abstain), mainnet guard

**Implementation reference:** `thiny-implementation-plan.md` Phases 5.2 + 6.2

---

### Phase 7 — `@thiny/plugin-solana`

**Package:** `packages/plugins/solana/`
**Deps:** `@solana/web3.js@^1`

Tasks:

- [ ] `solana_get_balance` — native SOL balance (lamports + SOL)
- [ ] `solana_send_sol` — `sensitive: true`, requires devnet keypair + policy
- [ ] `solanaTransferRules({ maxLamports, allowlist })` — deterministic `PolicyRule[]`
- [ ] Tests: fake connection, rules

**Implementation reference:** `thiny-implementation-plan.md` Phase 13

---

### Phase 8 — `@thiny/plugin-tokens` (ERC-20 + SPL)

**Package:** `packages/plugins/tokens/`

Tasks:

- [ ] ERC-20: `erc20_balance`, `erc20_allowance`, `erc20_approve` (sensitive), `erc20_transfer` (sensitive)
- [ ] `erc20TokenRules({ allowedTokens, allowedSpenders, maxApproveWei })` — kills unlimited-approval footgun
- [ ] SPL: `spl_token_balance`
- [ ] Tests: fake client, cap rules

**Implementation reference:** `thiny-implementation-plan.md` Phase 17

---

### Phase 9 — DEX swaps + `simulateMiddleware`

**Package A:** `packages/core/src/middleware/simulate.ts` (core)
**Package B:** `packages/plugins/swap-evm/` (Uniswap V3 on Sepolia)
**Package C:** `packages/plugins/swap-solana/` (Jupiter on devnet)

Tasks — simulate middleware:

- [ ] `simulateMiddleware(simulator)` — runs simulation for any `sensitive` tool before broadcast; throws if simulation fails → the model sees the failure as an observation, never sends a bad tx
- [ ] Export from core barrel
- [ ] Tests: passes on success, blocks on failure, skips non-sensitive

Tasks — swap plugins:

- [ ] `swap_quote` + `swap_execute` (sensitive) for EVM (quoter/executor injected)
- [ ] `sol_swap_quote` + `sol_swap_execute` (sensitive) for Solana (Jupiter quoter injected)
- [ ] Tests: fake quoter

**Implementation reference:** `thiny-implementation-plan.md` Phase 18

---

### Phase 10 — Market data + portfolio + trading policy

**Package A:** `packages/plugins/market/`
**Package B:** `packages/plugins/trading-policy/`

Tasks — market:

- [ ] `market_price({ ids, currency })` — CoinGecko-compatible, injected fetch
- [ ] `portfolio_update` / `portfolio_get` — in-memory per-run via `ctx.state`

Tasks — trading policy:

- [ ] `tradingPolicyRules({ allowedAssets, maxPositionSizeWei, maxSlippageBps })` — deterministic rules for `swap_execute` / `sol_swap_execute`
- [ ] Tests: asset allowlist deny, position size deny, slippage ceiling deny, approve

**Implementation reference:** `thiny-implementation-plan.md` Phases 19–20

---

### Phase 11 — Trading agent head + paper trading

**Package:** `heads/trading-agent/`

Tasks:

- [ ] `src/strategy.ts` — `SYSTEM_PROMPT` + `HEARTBEAT_INPUT` constants
- [ ] `src/paper.test.ts` — fully offline eval tests: scripted model + fake tools, asserts "quote before execute" and "check portfolio before deciding"
- [ ] `src/main.ts` — live daemon using `@thiny/runtime` (built in Phase 12), wired with all safety middleware (policy + simulate + budget + audit)
- [ ] Root script: `"trading-agent": "..."`
- [ ] All paper tests pass before any testnet run

**Implementation reference:** `thiny-implementation-plan.md` Phase 20

---

## Milestone 3 — Autonomy + ecosystem

### Phase 12 — `@thiny/runtime` (autonomous scheduler)

**Package:** `packages/runtime/`
**Deps:** `croner@^8`

Tasks:

- [ ] `Job { name, trigger: interval|cron, input, sessionId?, maxRuns? }`
- [ ] `Runtime { start(), stop(), runJob(job) }` — no-overlap guard, `maxRuns` kill switch, graceful shutdown
- [ ] `denyApprover` (already in core) wired as default headless approver in the daemon head
- [ ] Tests: heartbeat fires, no-overlap, `maxRuns`, fake timers
- [ ] `heads/daemon/` — always-on head: SIGINT/SIGTERM shutdown, `autoApprover`

**Implementation reference:** `thiny-implementation-plan.md` Phase 9

---

### Phase 13 — MCP client adapter

**Package:** `packages/adapters/mcp/`
**Deps:** `@modelcontextprotocol/sdk@^1`

Tasks:

- [ ] `jsonSchemaToZod(schema)` — converts common MCP JSON Schema subset to Zod (string/number/boolean/array/object)
- [ ] `mcpPlugin({ command, args?, env?, name? })` — connects to an MCP stdio server, lists tools, registers each as a Nucleus `Tool`; returns `McpPlugin & { close() }`
- [ ] Tests: schema converter (unit), fake server smoke test (manual)

**Implementation reference:** `thiny-implementation-plan.md` Phase 10

---

### Phase 14 — `@thiny/plugin-knowledge` (RAG)

**Package:** `packages/plugins/knowledge/`

Tasks:

- [ ] `cosine(a, b)` — cosine similarity
- [ ] `memoryVectorStore()` — in-memory store; swap for libsql-vector later behind same interface
- [ ] `knowledgePlugin({ embedder, topK? })` — `ingest(texts)`, `knowledge_search` tool, **retrieval middleware** (injects top-k chunks before each model call)
- [ ] `aiSdkEmbedder(modelId?)` in `@thiny/model-aisdk` — wraps `embedMany`
- [ ] Tests: cosine, store, retrieval with fake embedder

**Implementation reference:** `thiny-implementation-plan.md` Phase 14

---

### Phase 15 — `@thiny/plugin-resilience`

**Package:** `packages/plugins/resilience/`

Tasks:

- [ ] `retry({ retries, baseMs })` — exponential backoff, use only for idempotent tools
- [ ] `timeout(ms)` — fail a tool call that exceeds the limit
- [ ] `rateLimit(perMinute)` — per-process per-window cap
- [ ] `cache()` — memoize by `toolName + JSON(args)`
- [ ] `idempotency()` — dedup by `args.idempotencyKey`
- [ ] `runStructured(agent, input, zodSchema)` — parse + validate final JSON answer
- [ ] Compose order note: `timeout` → `retry` → `rateLimit` → `cache` / `idempotency`
- [ ] Tests: all 6 (fake timers for timeout)

**Implementation reference:** `thiny-implementation-plan.md` Phase 16

---

## Final directory tree (when M3 is done)

```
packages/
  core/                  @thiny/core
  agent/                 @thiny/agent          ← meta-package (M1)
  adapters/
    model-aisdk/         @thiny/model-aisdk
    logger-pino/         @thiny/logger-pino
    memory-sqlite/       @thiny/memory-sqlite  ← M1
    signer-viem/         @thiny/signer-viem    ← M2
    mcp/                 @thiny/mcp            ← M3
  plugins/
    web-search/          @thiny/plugin-web-search
    evm/                 @thiny/plugin-evm           ← M2
    solana/              @thiny/plugin-solana         ← M2
    tokens/              @thiny/plugin-tokens         ← M2
    swap-evm/            @thiny/plugin-swap-evm       ← M2
    swap-solana/         @thiny/plugin-swap-solana    ← M2
    market/              @thiny/plugin-market         ← M2
    trading-policy/      @thiny/plugin-trading-policy ← M2
    knowledge/           @thiny/plugin-knowledge      ← M3
    resilience/          @thiny/plugin-resilience     ← M3
  eval/                  @thiny/eval           ← M1
  runtime/               @thiny/runtime        ← M3
heads/
  cli/                   @thiny/cli
  http/                  @thiny/http           ← M1
  daemon/                @thiny/daemon         ← M3
  trading-agent/         @thiny/trading-agent  ← M2
apps/
  create-thiny/          create-thiny          ← M1
```

---

## Execution order summary

```
M1 (kernel complete) ─── Phase 1: memory-sqlite
│                    ─── Phase 2: @thiny/agent meta-package
│                    ─── Phase 3: create-thiny scaffolder
│                    ─── Phase 4: eval harness
│                    └── Phase 5: HTTP/SSE head + web UI

M2 (web3 stack) ─────── Phase 6:  signer-viem + plugin-evm
│               ─────── Phase 7:  plugin-solana
│               ─────── Phase 8:  plugin-tokens (ERC-20 + SPL)
│               ─────── Phase 9:  DEX swaps + simulateMiddleware
│               ─────── Phase 10: market data + portfolio + trading-policy
│               └────── Phase 11: trading-agent head + paper trading

M3 (autonomy + ecosystem) ── Phase 12: @thiny/runtime + daemon
│                         ── Phase 13: MCP client adapter
│                         ── Phase 14: plugin-knowledge (RAG)
│                         └── Phase 15: plugin-resilience
```

---

## Acceptance criteria for "Thiny complete"

| Check                    | How to verify                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Scaffold → running agent | `npx create-thiny my-hack && cd my-hack && pnpm install && pnpm agent` in < 1 min                                |
| Session persistence      | restart CLI, prior context still present                                                                         |
| Web2 demo                | `pnpm http`, open browser, chat streams live                                                                     |
| On-chain read            | agent answers "what's the ETH balance of 0x…?" on Sepolia                                                        |
| Testnet send             | propose + policy check + approval prompt + broadcast, non-allowlisted address is denied before signing           |
| Eval harness             | scripted scenario passes with no real API call                                                                   |
| Autonomous run           | `pnpm daemon` fires heartbeat every 60s, logs to pino, stops cleanly on Ctrl+C                                   |
| MCP integration          | `mcpPlugin({ command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] })` registers tools |
| Paper trading            | paper test suite passes before testnet run                                                                       |
| Coverage ≥ 70%           | `pnpm test:coverage` passes raised thresholds                                                                    |
| Lint + typecheck         | `pnpm lint && pnpm exec tsc -b` pass on all packages                                                             |
