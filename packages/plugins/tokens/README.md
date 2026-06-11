# @thiny/plugin-tokens

> Token research plugin for ERC-20 and SPL token metadata and prices

[![npm](https://img.shields.io/npm/v/@thiny/plugin-tokens)](https://www.npmjs.com/package/@thiny/plugin-tokens)

## Install

```bash
pnpm add @thiny/plugin-tokens
```

## Usage

```ts
import { tokensPlugin, erc20ApproveRules } from "@thiny/plugin-tokens";
import { createPublicClient, http } from "viem";

const plugin = tokensPlugin({ client: createPublicClient({ transport: http() }) });
```

## Public API

| Export | Description |
|--------|-------------|
| `tokensPlugin(opts)` | Token research tools (balance, metadata) |
| `erc20BalanceTool(client)` | ERC-20 balance check tool |
| `erc20ApproveRules` | Safety rules for token approvals |
| `TokensPluginOptions` | `client` (PublicClient) |
| `default` | Auto-configure from env |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/plugins/tokens)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
