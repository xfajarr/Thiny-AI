# @thiny/core

> Lightweight AI agent kernel with safety middleware, tool routing, and agent loop

[![npm](https://img.shields.io/npm/v/@thiny/core)](https://www.npmjs.com/package/@thiny/core)

## Install

```bash
pnpm add @thiny/core
```

## Usage

```ts
import { createAgent, tool, policyMiddleware, budgetMiddleware } from "@thiny/core";
import { aiSdkModel } from "@thiny/model-aisdk";
import { pinoLogger } from "@thiny/logger-pino";
import { sqliteMemory } from "@thiny/memory-sqlite";

const agent = createAgent({
  model: aiSdkModel({ model: "openai/gpt-4o" }),
  logger: pinoLogger(),
  memory: await sqliteMemory({ url: ":memory:" }),
  middleware: [
    policyMiddleware({ rules: [] }),
    budgetMiddleware({ maxTokens: 100_000 }),
  ],
});

const result = await agent.run("Hello, Thiny!");
console.log(result.text);
```

## Public API

| Export | Description |
|--------|-------------|
| `createAgent` | Create an agent instance |
| `tool` | Define a tool the agent can call |
| `policyMiddleware` | Safety policy middleware (allow/deny/approve) |
| `budgetMiddleware` | Token and call budget enforcement |
| `simulateMiddleware` | Pre-flight EVM transaction simulation |
| `compactionMiddleware` | Auto-compact long conversations |
| `auditMiddleware` | Log all tool calls for audit trail |
| `identityMiddleware` | Inject session/user identity context |
| `spawnAgent` | Spawn a sub-agent for delegated tasks |
| `EventBus` | Pub/sub event system |
| `Plugin`, `Middleware`, `Approver` | Extension interfaces |
| `*Domain` types | Tool, Stream, Web3, Message types |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/core)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
