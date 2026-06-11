# @thiny/agent

> Pre-assembled AI agent with all adapters and plugins — batteries included

[![npm](https://img.shields.io/npm/v/@thiny/agent)](https://www.npmjs.com/package/@thiny/agent)

## Install

```bash
pnpm add @thiny/agent
```

## Usage

```ts
import { createQuickAgent } from "@thiny/agent";

const agent = await createQuickAgent({
  model: "openai/gpt-4o",
  memory: "sqlite",
  plugins: ["evm", "solana", "web-search"],
});

const result = await agent.run("Send 0.1 ETH to vitalik.eth");
console.log(result.text);
```

Or compose manually:

```ts
import { createAgent } from "@thiny/core";
import { aiSdkModel } from "@thiny/agent";
import { pinoLogger } from "@thiny/agent";
import { sqliteMemory } from "@thiny/agent";
import { evmPlugin } from "@thiny/agent";

const agent = createAgent({
  model: aiSdkModel({ model: "openai/gpt-4o" }),
  logger: pinoLogger(),
  memory: await sqliteMemory({ url: ":memory:" }),
  plugins: [evmPlugin({ signer: await viemSigner({ privateKey: process.env.PK! }) })],
});
```

## Public API

Re-exports everything from:

| Package | Key exports |
|---------|-------------|
| `@thiny/core` | `createAgent`, `tool`, all middleware, domain types |
| `@thiny/model-aisdk` | `aiSdkModel`, `modelFromEnv` |
| `@thiny/logger-pino` | `pinoLogger` |
| `@thiny/memory-sqlite` | `sqliteMemory` |
| `@thiny/signer-viem` | `viemSigner` |
| `@thiny/plugin-evm` | `evmPlugin`, `evmTransferRules` |
| `@thiny/plugin-solana` | `solanaPlugin`, `solanaTransferRules` |
| `@thiny/plugin-web-search` | `webSearchPlugin` |
| `@thiny/eval` | `runEval`, `scriptModel` |
| `@thiny/runtime` | `Runtime`, `Job` |
| `@thiny/mcp` | `mcpPlugin`, `jsonSchemaToZod` |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/agent)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
