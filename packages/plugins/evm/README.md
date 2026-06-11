# @thiny/plugin-evm

> EVM blockchain plugin with wallet tools, transaction safety, and mainnet guard

[![npm](https://img.shields.io/npm/v/@thiny/plugin-evm)](https://www.npmjs.com/package/@thiny/plugin-evm)

## Install

```bash
pnpm add @thiny/plugin-evm
```

## Usage

```ts
import { evmPlugin, evmTransferRules } from "@thiny/plugin-evm";
import { viemSigner } from "@thiny/signer-viem";

const signer = viemSigner({ privateKey: process.env.PK!, chainId: 8453, rpcUrl: "..." });
const plugin = evmPlugin({ signer });
```

Or auto-configure from env:

```ts
// AGENT_PRIVATE_KEY=0x... CHAIN_ID=8453 RPC_URL=https://...
import evmDefault from "@thiny/plugin-evm";
const plugin = await evmDefault();
```

## Public API

| Export | Description |
|--------|-------------|
| `evmPlugin(opts)` | EVM wallet tools (send ETH, sign, balance) |
| `evmTransferRules` | Safety rules for transfer limits |
| `EvmPluginOptions` | `signer` |
| `EvmTransferLimits` | Type for transfer limit config |
| `default` | Auto-configure from env |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/plugins/evm)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
