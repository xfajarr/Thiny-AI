# @thiny/plugin-web-search

> Web search plugin using Brave Search API for real-time information

[![npm](https://img.shields.io/npm/v/@thiny/plugin-web-search)](https://www.npmjs.com/package/@thiny/plugin-web-search)

## Install

```bash
pnpm add @thiny/plugin-web-search
```

## Usage

```ts
import { webSearchPlugin } from "@thiny/plugin-web-search";

const plugin = webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY! });
```

Or auto-configure from env:

```ts
// BRAVE_API_KEY=BSA...
import webSearchDefault from "@thiny/plugin-web-search";
const plugin = webSearchDefault();
```

## Public API

| Export | Description |
|--------|-------------|
| `webSearchPlugin(opts)` | Brave Search web search tool |
| `WebSearchOptions` | `apiKey` |
| `default` | Auto-configure from `BRAVE_API_KEY` env |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/plugins/web-search)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
