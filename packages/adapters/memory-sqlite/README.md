# @thiny/memory-sqlite

> SQLite persistent memory adapter for agent sessions and state

[![npm](https://img.shields.io/npm/v/@thiny/memory-sqlite)](https://www.npmjs.com/package/@thiny/memory-sqlite)

## Install

```bash
pnpm add @thiny/memory-sqlite
```

## Usage

```ts
import { sqliteMemory } from "@thiny/memory-sqlite";

const memory = await sqliteMemory({ url: ":memory:" });
// or with Turso/LibSQL:
// const memory = await sqliteMemory({ url: "libsql://...", authToken: "..." });
```

## Public API

| Export | Description |
|--------|-------------|
| `sqliteMemory(opts)` | Create a SQLite-backed memory backend |
| `SqliteMemoryOptions` | `url`, `authToken?` |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/adapters/memory-sqlite)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
