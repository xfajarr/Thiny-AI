# @thiny/plugin-user-memory

> User memory plugin for personalized agent context and preferences

[![npm](https://img.shields.io/npm/v/@thiny/plugin-user-memory)](https://www.npmjs.com/package/@thiny/plugin-user-memory)

## Install

```bash
pnpm add @thiny/plugin-user-memory
```

## Usage

```ts
import { userMemoryPlugin } from "@thiny/plugin-user-memory";

const plugin = userMemoryPlugin({ userId: "alice" });
```

## Public API

| Export | Description |
|--------|-------------|
| `userMemoryPlugin(opts)` | User memory plugin |
| `loadUserMemory(id, backend)` | Load user memory from storage |
| `saveUserMemory(id, mem, backend)` | Persist user memory |
| `finalizeSession(agent, sessionId)` | Finalize and summarize a session |
| `UserMemory`, `SessionSummary` | Memory types |
| `UserMemoryOptions` | Plugin config |
| `userMemoryKey(id)` | Generate storage key |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/plugins/user-memory)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
