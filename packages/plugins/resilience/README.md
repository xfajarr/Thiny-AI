# @thiny/plugin-resilience

> Resilience plugin with rate limiting, retry, circuit breaking, and idempotency

[![npm](https://img.shields.io/npm/v/@thiny/plugin-resilience)](https://www.npmjs.com/package/@thiny/plugin-resilience)

## Install

```bash
pnpm add @thiny/plugin-resilience
```

## Usage

```ts
import { retry, timeout, rateLimit, toolCache, idempotency } from "@thiny/plugin-resilience";

const middleware = [
  retry({ maxAttempts: 3, backoff: "exponential" }),
  timeout(30_000),
  rateLimit({ maxCalls: 100, windowMs: 60_000 }),
  toolCache(),
  idempotency(),
];
```

## Public API

| Export | Description |
|--------|-------------|
| `retry(opts)` | Retry failed tool calls |
| `timeout(ms)` | Per-call timeout middleware |
| `rateLimit(opts)` | Rate limiting middleware |
| `toolCache()` | Cache tool call results |
| `idempotency()` | Idempotency key middleware |
| `runStructured(agent, input, schema)` | Run agent with structured Zod output |
| `default` | Auto-configure from env |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/plugins/resilience)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
