# @thiny/eval

> Evaluation harness for testing and benchmarking agent behaviors

[![npm](https://img.shields.io/npm/v/@thiny/eval)](https://www.npmjs.com/package/@thiny/eval)

## Install

```bash
pnpm add @thiny/eval
```

## Usage

```ts
import { runEval, scriptModel } from "@thiny/eval";

const scenarios = [
  { name: "greeting", input: "Hello!", expectFinal: /hello/i },
  { name: "eth-balance", input: "What is my ETH balance?", expectToolCalls: ["eth_balance"] },
];

const results = await runEval(agent, scenarios);
for (const r of results) {
  console.log(`${r.name}: ${r.passed ? "✓" : "✗"} ${r.reasons.join(", ")}`);
}
```

## Public API

| Export | Description |
|--------|-------------|
| `runEval(agent, scenarios)` | Run evaluation scenarios against an agent |
| `scriptModel(steps)` | Create a scripted model for deterministic testing |
| `Scenario` | `{ name, input, expectToolCalls?, expectFinal?, sessionId? }` |
| `EvalResult` | `{ name, passed, reasons, final, toolCalls }` |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/eval)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
