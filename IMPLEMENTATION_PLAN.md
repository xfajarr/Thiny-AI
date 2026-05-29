# Thiny — Implementation Plan

> **Last updated:** 2026-05-30
> **Reference docs:** `ROADMAP.md` (milestone overview), `docs/ARCHITECTURE.md`, `docs/PLUGINS.md`
> **Previous detailed TDD plan:** `thiny-implementation-plan.md` (Phases P0–P20, full code)

---

## Current state (as of 2026-05-30)

| Package                    | Status          | Notes                                                                                                                                                                                  |
| -------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@thiny/core`              | ✅ **Complete** | domain types, ports, ReAct loop, registry, plugin system (two-phase), middleware (audit, budget, policy, compaction), compose, stream, approvers, spawn (depth-limited), agent factory |
| `@thiny/model-aisdk`       | ✅ **Complete** | `aiSdkModel`, `modelFromEnv`, `loadThinyConfig`, `env-keys` (DRY), full streaming                                                                                                      |
| `@thiny/logger-pino`       | ✅ **Complete** | pretty/JSON/file sink, `adaptPinoLogger`                                                                                                                                               |
| `@thiny/plugin-web-search` | ✅ **Complete** | Brave Search, apiKey validation, differentiated HTTP errors                                                                                                                            |
| `heads/cli`                | ✅ **Complete** | streaming, pino, plugin wiring, session logging                                                                                                                                        |
| Dev tooling                | ✅ **Complete** | ESLint strict, Prettier, Husky, lint-staged, Changesets, coverage thresholds, VS Code settings, GitHub Actions CI/CD, PR/issue templates                                               |
| Docs                       | ✅ **Complete** | README, QUICKSTART, ARCHITECTURE, PLUGINS                                                                                                                                              |

**Test count: 54 passing · Lint: clean · Typecheck: clean · Coverage thresholds: passing**

---

## What "ready to use" means for this plan

| Target              | Acceptance criteria                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Web2 AI tools**   | Scaffold → running agent with any tool (REST API, file ops, etc.) in < 1 min. Streaming, session persistence, eval harness.   |
| **Web3 / on-chain** | Read EVM + Solana chain state. Testnet sends gated by deterministic policy + human approval. Paper-trade before live testnet. |

---

## Phases remaining

Each phase is a vertical tracer bullet — the system runs end-to-end after it.
Each task is TDD: failing test → implementation → passing test → commit.

---

## Phase 1 — `@thiny/memory-sqlite` (session persistence)

**Goal:** sessions survive process restarts.
**Why now:** `createAgent` defaults to `EphemeralMemory`. Every CLI restart loses context.

**Package:** `packages/adapters/memory-sqlite/`
**Deps:** `@libsql/client@^0.6`

### Task 1.1 — Implement `sqliteMemory`

**Files:**

- `packages/adapters/memory-sqlite/package.json`
- `packages/adapters/memory-sqlite/tsconfig.json`
- `packages/adapters/memory-sqlite/src/index.ts`
- `packages/adapters/memory-sqlite/src/__tests__/index.test.ts`
- `packages/adapters/memory-sqlite/CHANGELOG.md`

- [ ] **Write failing tests** — round-trip, multi-session isolation, append-replaces (all against `:memory:` libsql)

```ts
import { describe, it, expect } from "vitest";
import { sqliteMemory } from "../index.js";
import type { Message } from "@thiny/core";

describe("sqliteMemory", () => {
  it("round-trips a transcript for a session", async () => {
    const mem = await sqliteMemory({ url: ":memory:" });
    const msgs: Message[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    await mem.append("s1", msgs);
    expect(await mem.load("s1")).toEqual(msgs);
  });

  it("returns empty array for an unknown session", async () => {
    const mem = await sqliteMemory({ url: ":memory:" });
    expect(await mem.load("unknown")).toEqual([]);
  });

  it("append replaces (not appends to) the stored transcript", async () => {
    const mem = await sqliteMemory({ url: ":memory:" });
    await mem.append("s1", [{ role: "user", content: "a" }]);
    await mem.append("s1", [{ role: "user", content: "b" }]);
    const result = await mem.load("s1");
    expect(result).toHaveLength(1);
    expect((result[0] as { content: string }).content).toBe("b");
  });

  it("isolates data between sessions", async () => {
    const mem = await sqliteMemory({ url: ":memory:" });
    await mem.append("s1", [{ role: "user", content: "session-one" }]);
    expect(await mem.load("s2")).toEqual([]);
  });
});
```

- [ ] **Implement `sqliteMemory`**

```ts
import { createClient, type Client } from "@libsql/client";
import type { MemoryBackend, Message } from "@thiny/core";

export interface SqliteMemoryOptions {
  /** `:memory:`, `file:thiny.sqlite`, or a libsql/Turso URL. */
  url: string;
  authToken?: string;
}

class SqliteMemory implements MemoryBackend {
  constructor(private readonly db: Client) {}

  async load(sessionId: string): Promise<Message[]> {
    const res = await this.db.execute({
      sql: "SELECT payload FROM transcripts WHERE session = ?",
      args: [sessionId],
    });
    const row = res.rows[0];
    if (!row) return [];
    return JSON.parse(row["payload"] as string) as Message[];
  }

  async append(sessionId: string, messages: Message[]): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO transcripts (session, payload) VALUES (?, ?)
            ON CONFLICT(session) DO UPDATE SET payload = excluded.payload`,
      args: [sessionId, JSON.stringify(messages)],
    });
  }
}

/**
 * Create a SQLite-backed `MemoryBackend` using libsql.
 * Run `await sqliteMemory({ url: "file:thiny.sqlite" })` to get a persistent store.
 * Use `":memory:"` for ephemeral in-process storage (useful in tests).
 */
export async function sqliteMemory(opts: SqliteMemoryOptions): Promise<MemoryBackend> {
  const db = createClient({ url: opts.url, authToken: opts.authToken });
  await db.execute(
    "CREATE TABLE IF NOT EXISTS transcripts (session TEXT PRIMARY KEY, payload TEXT NOT NULL)",
  );
  return new SqliteMemory(db);
}
```

- [ ] **Run tests:** `pnpm vitest run packages/adapters/memory-sqlite` → PASS (4 tests)
- [ ] **Wire into CLI head** — add `SESSION_DB` env var, update `.env.example`
- [ ] **Add to `tsconfig.json` references**
- [ ] **Commit:** `feat(memory-sqlite): sqlite/libsql memory backend`

---

## Phase 2 — `@thiny/agent` meta-package (batteries-included entry point)

**Goal:** one import gives you everything needed to build an agent.
**Why now:** currently three imports required; reduces onboarding friction.

**Package:** `packages/agent/`

```ts
// After this phase — the most common case is one line:
import { createAgent, pinoLogger, loadThinyConfig, webSearchPlugin } from "@thiny/agent";
```

### Task 2.1 — Create the meta-package barrel

**Files:**

- `packages/agent/package.json`
- `packages/agent/tsconfig.json`
- `packages/agent/src/index.ts`
- `packages/agent/CHANGELOG.md`

- [ ] **`package.json`** — list `@thiny/core`, `@thiny/model-aisdk`, `@thiny/logger-pino`, `@thiny/plugin-web-search`, `@thiny/memory-sqlite` as **peerDependencies** (so consumers control versions)

```json
{
  "name": "@thiny/agent",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "peerDependencies": {
    "@thiny/core": "workspace:*",
    "@thiny/logger-pino": "workspace:*",
    "@thiny/model-aisdk": "workspace:*",
    "@thiny/memory-sqlite": "workspace:*",
    "@thiny/plugin-web-search": "workspace:*"
  }
}
```

- [ ] **`src/index.ts`** — re-export everything from all peer packages

```ts
// Core kernel — types, loop, plugins, middleware, approvers
export * from "@thiny/core";
// Model adapter — aiSdkModel, loadThinyConfig, modelFromEnv
export * from "@thiny/model-aisdk";
// Logger
export { pinoLogger, type PinoLoggerOptions } from "@thiny/logger-pino";
// Memory
export { sqliteMemory, type SqliteMemoryOptions } from "@thiny/memory-sqlite";
// Plugins
export { webSearchPlugin, type WebSearchOptions } from "@thiny/plugin-web-search";
```

- [ ] **Update README** — quickstart uses `@thiny/agent`, one import, one line
- [ ] **Commit:** `feat(agent): batteries-included meta-package`

---

## Phase 3 — `create-thiny` scaffolder

**Goal:** `npx create-thiny my-agent --plugins web-search,evm` produces a running agent project in < 1 minute.
**Why now:** this is the core product promise — "go from nothing to running in < 1 min".

**Package:** `apps/create-thiny/`

### Task 3.1 — File generation engine (TDD)

**Files:**

- `apps/create-thiny/package.json`
- `apps/create-thiny/tsconfig.json`
- `apps/create-thiny/src/generate.ts`
- `apps/create-thiny/src/generate.test.ts`
- `apps/create-thiny/src/index.ts`

- [ ] **Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { planFiles, renderAgentFile } from "./generate.js";

describe("scaffolder", () => {
  it("includes selected plugin imports", () => {
    const code = renderAgentFile({ name: "demo", plugins: ["web-search", "evm"] });
    expect(code).toContain("web-search");
    expect(code).toContain("evm");
    expect(code).not.toContain("plugin-solana");
  });

  it("produces exactly the required files", () => {
    const files = planFiles({ name: "demo", plugins: [] });
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual([".env.example", "package.json", "src/agent.ts", "thiny.config.json"]);
  });

  it("generated package.json has the project name", () => {
    const files = planFiles({ name: "my-app", plugins: [] });
    const pkg = files.find((f) => f.path === "package.json");
    expect(pkg).toBeDefined();
    const parsed = JSON.parse(pkg!.contents) as { name: string };
    expect(parsed.name).toBe("my-app");
  });
});
```

- [ ] **Implement `generate.ts`**

```ts
export interface ScaffoldOptions {
  name: string;
  plugins: string[];
}

export interface GeneratedFile {
  path: string;
  contents: string;
}

const PLUGIN_REGISTRY: Record<string, { import: string; setup: string }> = {
  "web-search": {
    import: 'import { webSearchPlugin } from "@thiny/plugin-web-search";',
    setup: "webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY! })",
  },
  evm: {
    import: 'import { evmPlugin } from "@thiny/plugin-evm";',
    setup: "evmPlugin({ rpcUrl: process.env.EVM_RPC_URL!, isTestnet: true })",
  },
  solana: {
    import: 'import { solanaPlugin } from "@thiny/plugin-solana";',
    setup: "solanaPlugin()",
  },
};

export function renderAgentFile(opts: ScaffoldOptions): string {
  const validPlugins = opts.plugins.filter((p) => p in PLUGIN_REGISTRY);
  const imports = validPlugins.map((p) => PLUGIN_REGISTRY[p]!.import).join("\n");
  const setups = validPlugins.map((p) => PLUGIN_REGISTRY[p]!.setup);

  return `import { createAgent, pinoLogger } from "@thiny/agent";
import { loadThinyConfig } from "@thiny/model-aisdk";
import { sqliteMemory } from "@thiny/memory-sqlite";
${imports}

async function main() {
  const agent = await createAgent({
    model: loadThinyConfig(),
    logger: pinoLogger(),
    memory: await sqliteMemory({ url: process.env.SESSION_DB ?? "file:agent.sqlite" }),
    systemPrompt: "You are ${opts.name}, a helpful AI agent.",
    plugins: [
      ${setups.join(",\n      ")}
    ],
  });

  const reply = await agent.run(process.argv[2] ?? "Hello!");
  console.log(reply);
}

main().catch((err: unknown) => { console.error(err); process.exit(1); });
`;
}

export function planFiles(opts: ScaffoldOptions): GeneratedFile[] {
  return [
    {
      path: "package.json",
      contents: JSON.stringify(
        {
          name: opts.name,
          type: "module",
          scripts: { agent: "node --env-file=.env --import tsx src/agent.ts" },
          dependencies: {
            "@thiny/agent": "*",
            "@thiny/model-aisdk": "*",
            "@thiny/memory-sqlite": "*",
            tsx: "^4",
          },
        },
        null,
        2,
      ),
    },
    { path: "src/agent.ts", contents: renderAgentFile(opts) },
    {
      path: "thiny.config.json",
      contents: JSON.stringify(
        { model: "openai:gpt-4o-mini", openai: { apiKey: "env:OPENAI_API_KEY" } },
        null,
        2,
      ),
    },
    {
      path: ".env.example",
      contents: "OPENAI_API_KEY=sk-...\nSESSION_DB=file:agent.sqlite\n",
    },
  ];
}
```

- [ ] **Implement `src/index.ts`** (CLI entrypoint for `npx create-thiny`)

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { planFiles } from "./generate.js";

async function main(): Promise<void> {
  const [, , name, ...rest] = process.argv;
  if (!name) {
    console.error("Usage: create-thiny <name> [--plugins web-search,evm]");
    process.exit(1);
  }
  const pluginsArg = rest[rest.indexOf("--plugins") + 1] ?? "";
  const plugins = pluginsArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const files = planFiles({ name, plugins });
  for (const file of files) {
    const fullPath = join(process.cwd(), name, file.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.contents, "utf8");
  }

  console.log(`\n✓ Created ${name}/ with ${String(plugins.length)} plugin(s)\n`);
  console.log(`  cd ${name}`);
  console.log(`  cp .env.example .env   # fill in your API key`);
  console.log(`  pnpm install`);
  console.log(`  pnpm agent "Hello!"\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Run tests:** `pnpm vitest run apps/create-thiny` → PASS (3 tests)
- [ ] **Add root script:** `"create-thiny": "node --import tsx apps/create-thiny/src/index.ts"`
- [ ] **Smoke test:** `pnpm create-thiny hello-world --plugins web-search` → creates `hello-world/`
- [ ] **Update README** with `npx create-thiny` example
- [ ] **Commit:** `feat(scaffolder): create-thiny project generator`

---

## Phase 4 — `@thiny/eval` harness

**Goal:** scripted scenarios run against a fake model — no API key, no network, no live cost.
**Why now:** run these before every hackathon demo to catch regressions.

**Package:** `packages/eval/`

### Task 4.1 — `scriptModel` + `runEval`

**Files:**

- `packages/eval/package.json`
- `packages/eval/tsconfig.json`
- `packages/eval/src/index.ts`
- `packages/eval/src/__tests__/index.test.ts`

- [ ] **Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createAgent, defineTool } from "@thiny/core";
import { scriptModel, runEval } from "../index.js";

describe("runEval", () => {
  it("passes when expected tool was called and final text matches", async () => {
    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [{ id: "1", name: "echo", args: { text: "hi" } }],
        },
        { finishReason: "stop", text: "the echo result is: hi" },
      ]),
      tools: [
        defineTool({
          name: "echo",
          description: "",
          parameters: z.object({ text: z.string() }),
          execute: async ({ text }) => text,
        }),
      ],
    });
    const results = await runEval(agent, [
      {
        name: "echo-test",
        input: "echo hi",
        expectToolCalls: ["echo"],
        expectFinal: /echo result/,
      },
    ]);
    expect(results[0]!.passed).toBe(true);
    expect(results[0]!.reasons).toHaveLength(0);
  });

  it("fails and reports when an expected tool was not called", async () => {
    const agent = await createAgent({
      model: scriptModel([{ finishReason: "stop", text: "no tools" }]),
    });
    const results = await runEval(agent, [
      { name: "missing-tool", input: "x", expectToolCalls: ["web_search"] },
    ]);
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.reasons.join()).toMatch(/missing tool call: web_search/);
  });

  it("fails when final text does not match expectation", async () => {
    const agent = await createAgent({
      model: scriptModel([{ finishReason: "stop", text: "wrong answer" }]),
    });
    const results = await runEval(agent, [
      { name: "text-check", input: "x", expectFinal: /correct answer/ },
    ]);
    expect(results[0]!.passed).toBe(false);
  });
});
```

- [ ] **Implement `src/index.ts`**

````ts
import type { Agent, ModelProvider, ModelResponse } from "@thiny/core";

/**
 * A deterministic `ModelProvider` that returns scripted responses in order.
 * When the script is exhausted, the last step is repeated.
 * Use in `runEval` scenarios to test agent behaviour without network calls.
 */
export function scriptModel(steps: ModelResponse[]): ModelProvider {
  if (steps.length === 0) throw new Error("scriptModel: steps array must not be empty");
  let index = 0;
  return {
    generate: async (): Promise<ModelResponse> => steps[Math.min(index++, steps.length - 1)]!,
  };
}

export interface Scenario {
  /** Identifier for the scenario (used in failure messages). */
  name: string;
  /** Input passed to `agent.run()`. */
  input: string;
  /** Tool names that MUST be called during the run. */
  expectToolCalls?: string[];
  /** Substring or RegExp the final answer must match. */
  expectFinal?: string | RegExp;
  sessionId?: string;
}

export interface EvalResult {
  name: string;
  passed: boolean;
  reasons: string[];
  final: string;
  toolCalls: string[];
}

/**
 * Run a set of scripted scenarios against an agent and assert their outcomes.
 * No network calls — pair with `scriptModel` for fully deterministic tests.
 *
 * @example
 * ```ts
 * const results = await runEval(agent, [
 *   { name: "greeting", input: "hello", expectFinal: /hello/i },
 * ]);
 * expect(results.every((r) => r.passed)).toBe(true);
 * ```
 */
export async function runEval(agent: Agent, scenarios: Scenario[]): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  for (const scenario of scenarios) {
    const observedToolCalls: string[] = [];
    const toolCallHandler = (payload: unknown) => {
      const { call } = payload as { call: { name: string } };
      observedToolCalls.push(call.name);
    };
    agent.events.on("beforeToolCall", toolCallHandler);

    const reasons: string[] = [];
    let finalText = "";

    try {
      finalText = await agent.run(scenario.input, {
        sessionId: scenario.sessionId ?? `eval:${scenario.name}`,
      });
    } catch (err) {
      reasons.push(`threw: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      agent.events.off("beforeToolCall", toolCallHandler);
    }

    for (const expectedTool of scenario.expectToolCalls ?? []) {
      if (!observedToolCalls.includes(expectedTool)) {
        reasons.push(`missing tool call: ${expectedTool}`);
      }
    }

    if (scenario.expectFinal !== undefined) {
      const matched =
        typeof scenario.expectFinal === "string"
          ? finalText.includes(scenario.expectFinal)
          : scenario.expectFinal.test(finalText);
      if (!matched) reasons.push(`final text did not match expectation`);
    }

    results.push({
      name: scenario.name,
      passed: reasons.length === 0,
      reasons,
      final: finalText,
      toolCalls: observedToolCalls,
    });
  }

  return results;
}
````

- [ ] **Run tests:** `pnpm vitest run packages/eval` → PASS (3 tests)
- [ ] **Add to `tsconfig.json` references**
- [ ] **Commit:** `feat(eval): deterministic scenario eval harness`

---

## Phase 5 — HTTP/SSE head + web UI

**Goal:** browser chat that streams — demo-ready in < 5 minutes.
**Why now:** hackathons are won on the demo. CLI is good; browser is better.

**Package:** `heads/http/`

### Task 5.1 — SSE helpers (TDD)

**Files:**

- `heads/http/package.json`
- `heads/http/tsconfig.json`
- `heads/http/src/sse.ts`
- `heads/http/src/sse.test.ts`
- `heads/http/src/web.ts`
- `heads/http/src/main.ts`

- [ ] **Write failing tests**

```ts
import { describe, it, expect, vi } from "vitest";
import { sseMessage, streamChat } from "./sse.js";
import type { Agent } from "@thiny/core";

describe("sseMessage", () => {
  it("formats as SSE data frame with JSON payload", () => {
    expect(sseMessage({ type: "delta", text: "hi\nthere" })).toBe(
      'data: {"type":"delta","text":"hi\\nthere"}\n\n',
    );
  });
});

describe("streamChat", () => {
  it("emits delta frames then a done frame", async () => {
    const agent = {
      run: vi.fn(async (_input: string, opts?: { onToken?: (d: string) => void }) => {
        opts?.onToken?.("Hel");
        opts?.onToken?.("lo");
        return "Hello";
      }),
      registry: {} as never,
      events: {} as never,
    } as unknown as Agent;

    const chunks: string[] = [];
    await streamChat(agent, "hi", "s1", (c) => chunks.push(c));

    expect(chunks).toEqual([
      'data: {"type":"delta","text":"Hel"}\n\n',
      'data: {"type":"delta","text":"lo"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
  });
});
```

- [ ] **Implement `sse.ts`**

```ts
import type { Agent } from "@thiny/core";

/** Format a payload as an SSE data frame. */
export function sseMessage(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Drive `agent.run` and stream each token as an SSE delta frame.
 * Emits a final `done` frame when the run completes.
 */
export async function streamChat(
  agent: Agent,
  input: string,
  sessionId: string,
  write: (chunk: string) => void,
): Promise<void> {
  await agent.run(input, {
    sessionId,
    onToken: (text) => write(sseMessage({ type: "delta", text })),
  });
  write(sseMessage({ type: "done" }));
}
```

- [ ] **Implement `web.ts`** — one-file streaming chat UI (vanilla HTML/JS, no dependencies)

```ts
export const WEB_UI = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Thiny</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; }
  #log { min-height: 200px; background: #f8f8f8; border-radius: 8px; padding: 16px; white-space: pre-wrap; margin-bottom: 16px; }
  form { display: flex; gap: 8px; }
  input { flex: 1; padding: 10px 14px; border: 1px solid #ccc; border-radius: 6px; font-size: 15px; }
  button { padding: 10px 20px; background: #111; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
  button:hover { background: #333; }
</style></head>
<body>
<h2>Thiny</h2>
<div id="log"></div>
<form id="f">
  <input id="i" autocomplete="off" placeholder="Type a message…" autofocus />
  <button type="submit">Send</button>
</form>
<script>
const log = document.getElementById('log');
const input = document.getElementById('i');
document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  log.textContent += '\\n> ' + msg + '\\n';
  const res = await fetch('/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: msg, sessionId: 'web' }),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\\n\\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (frame.startsWith('data: ')) {
        const m = JSON.parse(frame.slice(6));
        if (m.type === 'delta') log.textContent += m.text;
      }
    }
  }
  log.textContent += '\\n';
};
</script>
</body></html>`;
```

- [ ] **Implement `main.ts`** — `node:http` server, `GET /` → UI, `POST /chat` → SSE stream

```ts
import { createServer } from "node:http";
import { createAgent, pinoLogger } from "@thiny/agent";
import { loadThinyConfig } from "@thiny/model-aisdk";
import { sqliteMemory } from "@thiny/memory-sqlite";
import { streamChat } from "./sse.js";
import { WEB_UI } from "./web.js";

async function main(): Promise<void> {
  const logger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info" });
  const agent = await createAgent({
    model: loadThinyConfig(),
    logger,
    memory: await sqliteMemory({ url: process.env.SESSION_DB ?? "file:agent.sqlite" }),
    systemPrompt: "You are a helpful web-based AI assistant.",
  });

  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(WEB_UI);
      return;
    }
    if (req.method === "POST" && req.url === "/chat") {
      let body = "";
      for await (const chunk of req) body += chunk as string;
      const { input, sessionId } = JSON.parse(body || "{}") as {
        input: string;
        sessionId?: string;
      };
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });
      try {
        await streamChat(agent, input, sessionId ?? "web", (chunk) => res.write(chunk));
      } catch (err) {
        res.write(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`);
      }
      res.end();
      return;
    }
    res.writeHead(404).end();
  });

  const port = Number(process.env.PORT ?? 8787);
  server.listen(port, () =>
    logger.info(
      { event: "http_ready", port, url: `http://localhost:${port}` },
      `HTTP head listening on port ${String(port)}`,
    ),
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Run SSE tests:** `pnpm vitest run heads/http/src/sse.test.ts` → PASS (2 tests)
- [ ] **Manual test:** `pnpm http`, open `http://localhost:8787`, type a message, verify streaming
- [ ] **Add root script:** `"http": "node --env-file=.env --import tsx heads/http/src/main.ts"`
- [ ] **Commit:** `feat(http): SSE server + streaming web chat UI`

---

## Phase 6 — `@thiny/signer-viem` + `@thiny/plugin-evm` (Web3 read + testnet send)

**Goal:** agent reads EVM chain state and can propose testnet transactions gated by policy + approval.
**Why now:** required for any on-chain hackathon.

**Package A:** `packages/adapters/signer-viem/`
**Package B:** `packages/plugins/evm/`
**Deps:** `viem@^2`

### Task 6.1 — `@thiny/signer-viem`

**Files:**

- `packages/adapters/signer-viem/package.json`
- `packages/adapters/signer-viem/tsconfig.json`
- `packages/adapters/signer-viem/src/index.ts`
- `packages/adapters/signer-viem/src/__tests__/index.test.ts`

- [ ] **Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { viemSigner } from "../index.js";

const TESTNET_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("viemSigner", () => {
  it("derives a valid EVM address", () => {
    const signer = viemSigner({
      privateKey: TESTNET_KEY,
      chainId: 11155111,
      rpcUrl: "http://localhost:8545",
      isTestnet: true,
    });
    expect(signer.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(signer.isTestnet).toBe(true);
  });

  it("refuses mainnet unless allowMainnet is explicitly true", () => {
    expect(() =>
      viemSigner({ privateKey: TESTNET_KEY, chainId: 1, rpcUrl: "http://x", isTestnet: false }),
    ).toThrow(/mainnet.*allowMainnet/i);
  });
});
```

- [ ] **Implement `src/index.ts`** — `privateKeyToAccount`, viem wallet client, mainnet guard, wait for receipt
- [ ] **Run tests → PASS (2 tests)**

### Task 6.2 — `@thiny/plugin-evm`

**Files:**

- `packages/plugins/evm/package.json`
- `packages/plugins/evm/tsconfig.json`
- `packages/plugins/evm/src/tools.ts`
- `packages/plugins/evm/src/rules.ts`
- `packages/plugins/evm/src/rules.test.ts`
- `packages/plugins/evm/src/tools.test.ts`
- `packages/plugins/evm/src/index.ts`

**Tools to implement:**

| Tool                | Sensitive | Description                                     |
| ------------------- | --------- | ----------------------------------------------- |
| `evm_get_balance`   | no        | Native token balance (wei + formatted)          |
| `evm_read_contract` | no        | Call any view/pure function                     |
| `evm_send_native`   | **yes**   | Send native tokens — requires policy + approval |

**Policy rules:**

- `evmTransferRules({ maxValueWei, allowlist })` — deterministic; deny if value > cap or destination not allowlisted; approve if both pass

- [ ] **Write failing tests for rules (unit — no RPC)**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { evmTransferRules } from "./rules.js";
import { defineTool, type Ctx } from "@thiny/core";

const sendTool = defineTool({
  name: "evm_send_native",
  description: "",
  sensitive: true,
  parameters: z.object({ to: z.string(), valueWei: z.string() }),
  execute: async () => "0xhash",
});
const ctx = {} as Ctx;
const rules = evmTransferRules({ maxValueWei: 1_000_000n, allowlist: ["0xAllowed"] });

describe("evmTransferRules", () => {
  it("denies when value exceeds cap", () => {
    expect(
      rules[0]!({ tool: sendTool, args: { to: "0xAllowed", valueWei: "9999999" }, ctx }),
    ).toMatchObject({ effect: "deny" });
  });
  it("denies when destination not on allowlist", () => {
    expect(
      rules[0]!({ tool: sendTool, args: { to: "0xOther", valueWei: "10" }, ctx }),
    ).toMatchObject({ effect: "deny" });
  });
  it("approves an in-policy send", () => {
    expect(
      rules[0]!({ tool: sendTool, args: { to: "0xAllowed", valueWei: "10" }, ctx }),
    ).toMatchObject({ effect: "approve" });
  });
  it("abstains for non-send tools", () => {
    expect(rules[0]!({ tool: { ...sendTool, name: "evm_get_balance" }, args: {}, ctx })).toBeNull();
  });
});
```

- [ ] **Write failing tests for tools (fake client — no RPC)**

```ts
import { describe, it, expect } from "vitest";
import { evmPlugin } from "./index.js";

const fakeClient = { getBalance: async () => 1_500_000_000_000_000_000n } as never;

describe("evmPlugin", () => {
  it("evm_get_balance returns wei and formatted ETH", async () => {
    const plugin = evmPlugin({ publicClient: fakeClient, chainId: 11155111, isTestnet: true });
    const tool = plugin.tools!.find((t) => t.name === "evm_get_balance")!;
    const out = (await tool.execute({ address: "0xabc" }, {} as never)) as {
      wei: string;
      eth: string;
    };
    expect(out.wei).toBe("1500000000000000000");
    expect(out.eth).toBe("1.5");
  });
});
```

- [ ] **Implement tools and rules** (see `thiny-implementation-plan.md` Phase 5 + 6.2 for full code)
- [ ] **Run all EVM tests → PASS**
- [ ] **Wire into CLI/daemon with policyMiddleware(evmTransferRules(...))**
- [ ] **Commit:** `feat(evm): read tools + gated testnet send + transfer rules`

---

## Phase 7 — `@thiny/plugin-solana` (Web3 read + devnet send)

**Goal:** same capability as Phase 6 but for Solana devnet.
**Package:** `packages/plugins/solana/`
**Deps:** `@solana/web3.js@^1`

### Task 7.1 — Solana read + send tools + rules

**Tools to implement:**

| Tool                 | Sensitive | Description                                     |
| -------------------- | --------- | ----------------------------------------------- |
| `solana_get_balance` | no        | Native SOL balance (lamports + SOL)             |
| `solana_send_sol`    | **yes**   | Send SOL on devnet — requires policy + approval |

**Policy rules:** `solanaTransferRules({ maxLamports, allowlist })`

- [ ] **Write failing tests for rules and tools** (fake connection — no RPC, pattern mirrors EVM tests)
- [ ] **Implement plugin** (see `thiny-implementation-plan.md` Phase 13)
- [ ] **Wire into relevant heads with policy middleware**
- [ ] **Commit:** `feat(solana): read tools + gated devnet send + transfer rules`

---

## Phase 8 — `@thiny/runtime` (autonomous / always-on agents)

**Goal:** run an agent on a heartbeat or cron schedule — for trading monitors, social bots, alert systems.
**Package:** `packages/runtime/`
**Deps:** `croner@^8`

### Task 8.1 — Scheduler + `heads/daemon`

**Files:**

- `packages/runtime/package.json`
- `packages/runtime/tsconfig.json`
- `packages/runtime/src/index.ts`
- `packages/runtime/src/__tests__/index.test.ts`
- `heads/daemon/package.json`
- `heads/daemon/tsconfig.json`
- `heads/daemon/src/main.ts`

- [ ] **Write failing tests** (fake timers for interval scheduling)

```ts
import { describe, it, expect, vi } from "vitest";
import { Runtime, type Job } from "../index.js";
import type { Agent } from "@thiny/core";

function fakeAgent(run: Agent["run"]): Agent {
  return { run, registry: {} as never, events: {} as never };
}

describe("Runtime", () => {
  it("calls agent.run with the job input", async () => {
    const run = vi.fn(async () => "ok");
    const rt = new Runtime({ agent: fakeAgent(run as never) });
    await rt.runJob({ name: "j", trigger: { kind: "interval", ms: 1000 }, input: "tick" });
    expect(run).toHaveBeenCalledWith("tick", { sessionId: "job:j" });
  });

  it("resolves a function input before running", async () => {
    const run = vi.fn(async () => "ok");
    const rt = new Runtime({ agent: fakeAgent(run as never) });
    await rt.runJob({
      name: "j",
      trigger: { kind: "interval", ms: 1000 },
      input: async () => "dynamic",
    });
    expect(run).toHaveBeenCalledWith("dynamic", { sessionId: "job:j" });
  });

  it("skips overlapping runs", async () => {
    let release!: () => void;
    const run = vi.fn(
      () =>
        new Promise<string>((r) => {
          release = () => r("ok");
        }),
    );
    const rt = new Runtime({ agent: fakeAgent(run as never) });
    const job: Job = { name: "j", trigger: { kind: "interval", ms: 1000 }, input: "tick" };
    const p1 = rt.runJob(job);
    const p2 = rt.runJob(job); // in-flight — skipped
    release();
    await Promise.all([p1, p2]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("respects maxRuns kill switch", async () => {
    const run = vi.fn(async () => "ok");
    const rt = new Runtime({ agent: fakeAgent(run as never) });
    const job: Job = {
      name: "j",
      trigger: { kind: "interval", ms: 1000 },
      input: "tick",
      maxRuns: 2,
    };
    await rt.runJob(job);
    await rt.runJob(job);
    await rt.runJob(job); // skipped
    expect(run).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Implement `Runtime`** (see `thiny-implementation-plan.md` Phase 9 for full code)
- [ ] **Implement `heads/daemon/src/main.ts`** — SIGINT/SIGTERM graceful shutdown, `autoApprover`, heartbeat job
- [ ] **Add root script:** `"daemon": "node --env-file=.env --import tsx heads/daemon/src/main.ts"`
- [ ] **Run tests → PASS (4 tests)**
- [ ] **Commit:** `feat(runtime): autonomous scheduler + daemon head`

---

## Phase 9 — Integration test: end-to-end Web3 agent run

**Goal:** one scripted test proves the full stack works — model → tool call → policy gate → testnet action → logged result.
**Why now:** confirm all phases compose correctly before claiming "ready".

### Task 9.1 — Full-stack eval scenarios

**Files:**

- `packages/eval/src/__tests__/web3.eval.test.ts` (uses `scriptModel` + fake viem client)

- [ ] **Write scenarios**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createAgent,
  defineTool,
  policyMiddleware,
  autoApprover,
  modelAuditMiddleware,
  toolAuditMiddleware,
} from "@thiny/core";
import { scriptModel, runEval } from "@thiny/eval";
import type { Logger } from "@thiny/core";

const silent: Logger = {
  info() {},
  warn() {},
  error() {},
  child() {
    return silent;
  },
};

describe("Web3 agent integration scenarios", () => {
  it("reads chain balance without approval", async () => {
    const balanceTool = defineTool({
      name: "evm_get_balance",
      description: "",
      parameters: z.object({ address: z.string() }),
      execute: async () => ({ wei: "1000000000000000000", eth: "1.0" }),
    });
    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [{ id: "1", name: "evm_get_balance", args: { address: "0xabc" } }],
        },
        { finishReason: "stop", text: "The balance is 1.0 ETH" },
      ]),
      tools: [balanceTool],
      logger: silent,
      plugins: [{ name: "policy", toolMiddleware: [policyMiddleware([])] }],
      approver: autoApprover([]), // deny all sensitive tools
    });
    const results = await runEval(agent, [
      {
        name: "balance-read",
        input: "check balance of 0xabc",
        expectToolCalls: ["evm_get_balance"],
        expectFinal: /1\.0 ETH/,
      },
    ]);
    expect(results[0]!.passed).toBe(true);
  });

  it("blocks a sensitive send when no approver is configured", async () => {
    const sendTool = defineTool({
      name: "evm_send_native",
      description: "",
      sensitive: true,
      parameters: z.object({ to: z.string(), valueWei: z.string() }),
      execute: async () => "0xhash",
    });
    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [
            { id: "1", name: "evm_send_native", args: { to: "0xBad", valueWei: "9999999999" } },
          ],
        },
        { finishReason: "stop", text: "The send was denied" },
      ]),
      tools: [sendTool],
      logger: silent,
      plugins: [{ name: "policy", toolMiddleware: [policyMiddleware([])] }],
      // No approver — sensitive tools default to deny
    });
    const results = await runEval(agent, [
      { name: "send-blocked", input: "send ETH", expectFinal: /denied|blocked|error/i },
    ]);
    expect(results[0]!.passed).toBe(true);
  });
});
```

- [ ] **Run:** `pnpm vitest run packages/eval` → all passing
- [ ] **Commit:** `test(eval): web3 integration scenarios`

---

## Phase 10 — MCP client adapter

**Goal:** any MCP server's tools are available instantly without writing a plugin.
**Package:** `packages/adapters/mcp/`
**Deps:** `@modelcontextprotocol/sdk@^1`

### Task 10.1 — JSON Schema → Zod converter + MCP plugin factory

**Files:**

- `packages/adapters/mcp/package.json`
- `packages/adapters/mcp/tsconfig.json`
- `packages/adapters/mcp/src/schema.ts`
- `packages/adapters/mcp/src/schema.test.ts`
- `packages/adapters/mcp/src/index.ts`

- [ ] **Write failing tests for `jsonSchemaToZod`**

```ts
import { describe, it, expect } from "vitest";
import { jsonSchemaToZod } from "../schema.js";

describe("jsonSchemaToZod", () => {
  it("converts an object with required + optional fields", () => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: { path: { type: "string" }, depth: { type: "integer" } },
      required: ["path"],
    });
    expect(schema.safeParse({ path: "/a" }).success).toBe(true);
    expect(schema.safeParse({ depth: 2 }).success).toBe(false);
  });

  it("falls back to z.unknown() for unsupported shapes", () => {
    expect(jsonSchemaToZod(undefined).safeParse(123).success).toBe(true);
  });
});
```

- [ ] **Implement `schema.ts`** — map `string/number/integer/boolean/array/object` subtypes to Zod
- [ ] **Implement `mcpPlugin({ command, args?, name? })`** — connects to stdio MCP server, lists tools, registers each as a Thiny `Tool`
- [ ] **Run tests → PASS (2 tests)**
- [ ] **Smoke test** with `@modelcontextprotocol/server-filesystem`
- [ ] **Commit:** `feat(mcp): consume any MCP server as Thiny tools`

---

## Final acceptance checklist

Run these before declaring Thiny "ready to use":

### Web2 tools

- [ ] `npx create-thiny my-demo --plugins web-search` → project created
- [ ] `cd my-demo && cp .env.example .env && pnpm install && pnpm agent "search for news about AI"` → streams a real answer
- [ ] Restart the agent process → prior session context still present (SQLite memory)
- [ ] `pnpm http` → browser chat streams live at `http://localhost:8787`
- [ ] Eval harness: scripted scenario passes without an API key

### Web3 / on-chain

- [ ] `evm_get_balance` returns Sepolia testnet ETH balance
- [ ] Attempt to send to a non-allowlisted address → `PolicyError` before any signing
- [ ] Attempt to send over the value cap → `PolicyError` before any signing
- [ ] In-policy testnet send → policy approves → approval prompt → user types `y` → tx broadcasts → hash returned
- [ ] Solana devnet balance read → returns lamports + SOL
- [ ] All above scenarios pass as paper-trade eval tests (offline, no test ETH needed)

### Autonomous / always-on

- [ ] `pnpm daemon` fires heartbeat every 60s, logs `session_start`/`session_end`
- [ ] Ctrl+C → graceful shutdown (no stray processes)
- [ ] `maxRuns: 3` kill switch: daemon stops after 3 runs

### Quality gates (must all pass on every commit)

- [ ] `pnpm test:coverage` → thresholds pass, coverage ≥ 70%
- [ ] `pnpm lint` → 0 errors, 0 warnings
- [ ] `pnpm exec tsc -b` → typecheck clean
- [ ] `pnpm format:check` → formatting clean
- [ ] `pnpm changeset` → changeset added for any public API change

---

## Execution order

```
Phase 1  memory-sqlite        ← removes the #1 daily annoyance
Phase 2  @thiny/agent         ← one-import DX (5 min of work)
Phase 3  create-thiny         ← fulfils the < 1 min promise
Phase 4  eval harness         ← reliability before demos
Phase 5  HTTP/SSE head        ← demo polish
─── Web2 stack complete ───
Phase 6  signer-viem + EVM    ← on-chain foundation
Phase 7  plugin-solana        ← second chain, doubles hackathon addressability
Phase 8  runtime + daemon     ← always-on capability
Phase 9  integration test     ← confirms the full stack composes
Phase 10 MCP adapter          ← force multiplier: hundreds of integrations in one adapter
─── Web3 stack complete ───
```

Phases 1–5 complete the Web2 story. Phases 6–10 complete the Web3 story. Each phase leaves the system in a running, testable state.

---

## Key TDD files reference

| Phase             | Detailed code for all TDD steps                 |
| ----------------- | ----------------------------------------------- |
| 1 (memory-sqlite) | `thiny-implementation-plan.md` Phase 4 Task 4.1 |
| 4 (eval)          | `thiny-implementation-plan.md` Phase 12         |
| 5 (HTTP head)     | `thiny-implementation-plan.md` Phase 11         |
| 6 (EVM)           | `thiny-implementation-plan.md` Phases 5–6       |
| 7 (Solana)        | `thiny-implementation-plan.md` Phase 13         |
| 8 (runtime)       | `thiny-implementation-plan.md` Phase 9          |
| 10 (MCP)          | `thiny-implementation-plan.md` Phase 10         |
