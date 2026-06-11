# @thiny/otel

> OpenTelemetry tracing adapter for distributed agent observability

[![npm](https://img.shields.io/npm/v/@thiny/otel)](https://www.npmjs.com/package/@thiny/otel)

## Install

```bash
pnpm add @thiny/otel
```

## Usage

```ts
import { otelTracingPlugin } from "@thiny/otel";

const plugin = otelTracingPlugin({ tracerName: "thiny-agent" });
```

Auto-configure with OTLP exporter:

```ts
// OTEL_TRACER_NAME=thiny-agent OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
import otelDefault from "@thiny/otel";
const plugin = otelDefault();
```

## Public API

| Export | Description |
|--------|-------------|
| `otelTracingPlugin(opts?)` | Create an OTel tracing plugin |
| `OtelTracingOptions` | `tracerName?` |
| `default` | Auto-configure from env |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/adapters/otel)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
