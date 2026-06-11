# @thiny/runtime

> Cron-based scheduler for running autonomous agents on a heartbeat

[![npm](https://img.shields.io/npm/v/@thiny/runtime)](https://www.npmjs.com/package/@thiny/runtime)

## Install

```bash
pnpm add @thiny/runtime
```

## Usage

```ts
import { Runtime } from "@thiny/runtime";

const runtime = new Runtime({
  agent,
  jobs: [
    { name: "market-scan", trigger: { kind: "interval", ms: 60_000 }, input: "Scan for market opportunities" },
    { name: "daily-report", trigger: { kind: "cron", expr: "0 9 * * *" }, input: "Generate daily portfolio report" },
  ],
});

runtime.start();

// Graceful shutdown
process.on("SIGINT", () => runtime.stop());
```

## Public API

| Export | Description |
|--------|-------------|
| `Runtime` | Scheduler class for autonomous agents |
| `RuntimeOptions` | `agent`, `jobs?`, `logger?` |
| `Job` | `{ name, trigger, input, sessionId?, maxRuns? }` |
| `Trigger` | `{ kind: "interval", ms }` or `{ kind: "cron", expr }` |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/runtime)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
