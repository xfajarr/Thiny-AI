# @thiny/signer-viem

> Viem wallet signer adapter for EVM transaction signing

[![npm](https://img.shields.io/npm/v/@thiny/signer-viem)](https://www.npmjs.com/package/@thiny/signer-viem)

## Install

```bash
pnpm add @thiny/signer-viem
```

## Usage

```ts
import { viemSigner } from "@thiny/signer-viem";

const signer = viemSigner({
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  chainId: 8453,          // Base
  rpcUrl: "https://mainnet.base.org",
  isTestnet: false,
  allowMainnet: true,     // explicit opt-in required
});
```

## Public API

| Export | Description |
|--------|-------------|
| `viemSigner(opts)` | Create a Viem wallet signer |
| `ViemSignerOptions` | `privateKey`, `chainId`, `rpcUrl`, `isTestnet`, `allowMainnet?` |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/adapters/signer-viem)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
