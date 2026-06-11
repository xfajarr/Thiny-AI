# @thiny/model-aisdk

> Vercel AI SDK model adapter for OpenAI, Anthropic, and more

[![npm](https://img.shields.io/npm/v/@thiny/model-aisdk)](https://www.npmjs.com/package/@thiny/model-aisdk)

## Install

```bash
pnpm add @thiny/model-aisdk
```

## Usage

```ts
import { aiSdkModel } from "@thiny/model-aisdk";

const model = aiSdkModel({ model: "openai/gpt-4o" });
// or from env: uses OPENAI_API_KEY / ANTHROPIC_API_KEY automatically
import { modelFromEnv } from "@thiny/model-aisdk";
const model2 = modelFromEnv();
```

## Public API

| Export | Description |
|--------|-------------|
| `aiSdkModel(opts)` | Create a model provider using AI SDK |
| `modelFromEnv()` | Auto-configure a model from environment variables |
| `AiSdkOptions` | Options: `model`, `openai?`, `anthropic?`, `maxRetries?` |
| `ProviderOptions` | `baseURL?`, `apiKey?` |
| `ThinyConfig`, `loadThinyConfig` | Config file loader |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/adapters/model-aisdk)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
