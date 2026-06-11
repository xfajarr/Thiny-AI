# @thiny/plugin-trading-policy

> Trading safety policy plugin with approval rules and spending limits

[![npm](https://img.shields.io/npm/v/@thiny/plugin-trading-policy)](https://www.npmjs.com/package/@thiny/plugin-trading-policy)

## Install

```bash
pnpm add @thiny/plugin-trading-policy
```

## Usage

```ts
import { tradingPolicyRules } from "@thiny/plugin-trading-policy";

const rules = tradingPolicyRules({
  maxSlippage: 0.05,     // 5%
  maxPositionSize: 1000,  // $1,000 USDC
});
```

## Public API

| Export | Description |
|--------|-------------|
| `tradingPolicyRules(opts)` | Generate trading safety policy rules |
| `TradingPolicyOptions` | `maxSlippage`, `maxPositionSize`, etc. |
| `default` | Auto-configure from env |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/plugins/trading-policy)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
