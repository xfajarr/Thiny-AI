# @thiny/logger-pino

> Pino structured logging adapter with secret redaction

[![npm](https://img.shields.io/npm/v/@thiny/logger-pino)](https://www.npmjs.com/package/@thiny/logger-pino)

## Install

```bash
pnpm add @thiny/logger-pino
```

## Usage

```ts
import { pinoLogger } from "@thiny/logger-pino";

const logger = pinoLogger({ level: "info", pretty: true });
```

## Public API

| Export | Description |
|--------|-------------|
| `pinoLogger(opts?)` | Create a Pino-backed logger |
| `PinoLoggerOptions` | `level?`, `file?`, `pretty?`, `stderr?` |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/adapters/logger-pino)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
