# @thiny/plugin-solana

> Solana blockchain plugin with wallet tools, SPL tokens, and transaction safety

[![npm](https://img.shields.io/npm/v/@thiny/plugin-solana)](https://www.npmjs.com/package/@thiny/plugin-solana)

## Install

```bash
pnpm add @thiny/plugin-solana
```

## Usage

```ts
import { solanaPlugin, solanaTransferRules } from "@thiny/plugin-solana";

const plugin = solanaPlugin();
```

## Public API

| Export | Description |
|--------|-------------|
| `solanaPlugin(opts?)` | Solana wallet tools (send SOL, SPL tokens, balance) |
| `solanaTransferRules` | Safety rules for transfer limits |
| `SolanaPluginOptions` | Plugin config options |
| `SolanaTransferLimits` | Type for transfer limit config |
| `default` | Auto-configure from env |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/plugins/solana)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
