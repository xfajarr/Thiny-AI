# @thiny/plugin-market

> Crypto market data plugin for prices, trends, and on-chain analytics

[![npm](https://img.shields.io/npm/v/@thiny/plugin-market)](https://www.npmjs.com/package/@thiny/plugin-market)

## Install

```bash
pnpm add @thiny/plugin-market
```

## Usage

```ts
import { marketPlugin } from "@thiny/plugin-market";

const plugin = marketPlugin();
```

## Public API

| Export | Description |
|--------|-------------|
| `marketPlugin(opts?)` | Crypto price and market data tools |
| `MarketPluginOptions` | Plugin config |
| `default` | Auto-configure from env |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/plugins/market)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
