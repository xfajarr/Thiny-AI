# @thiny/mcp

> Model Context Protocol adapter for connecting to MCP tool servers

[![npm](https://img.shields.io/npm/v/@thiny/mcp)](https://www.npmjs.com/package/@thiny/mcp)

## Install

```bash
pnpm add @thiny/mcp
```

## Usage

```ts
import { mcpPlugin, jsonSchemaToZod } from "@thiny/mcp";

const plugin = await mcpPlugin({
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
});
```

Or auto-configure from env:

```ts
// MCP_COMMAND=npx MCP_ARGS=-y,@modelcontextprotocol/server-filesystem,/tmp
import mcpDefault from "@thiny/mcp";
const plugin = await mcpDefault();
```

## Public API

| Export | Description |
|--------|-------------|
| `mcpPlugin(opts)` | Create an MCP plugin from a stdio server |
| `jsonSchemaToZod(schema)` | Convert JSON Schema to Zod for validation |
| `McpStdioOptions` | `command`, `args?`, `env?`, `name?` |
| `McpPlugin` | Plugin type with `close()` |
| `default` | Auto-configure from `MCP_COMMAND` env |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/adapters/mcp)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
