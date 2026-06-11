# @thiny/plugin-knowledge

> Knowledge management plugin with RAG, vector search, and document indexing

[![npm](https://img.shields.io/npm/v/@thiny/plugin-knowledge)](https://www.npmjs.com/package/@thiny/plugin-knowledge)

## Install

```bash
pnpm add @thiny/plugin-knowledge
```

## Usage

```ts
import { knowledgePlugin, localEmbedder, memoryVectorStore } from "@thiny/plugin-knowledge";

const store = memoryVectorStore();
const embedder = localEmbedder();
const plugin = knowledgePlugin({ store, embedder });
```

## Public API

| Export | Description |
|--------|-------------|
| `knowledgePlugin(opts)` | RAG knowledge plugin |
| `freeKnowledgePlugin(opts?)` | Zero-config knowledge plugin |
| `localEmbedder()` | Local text embedding |
| `randomEmbedder()` | Random embedding (testing) |
| `memoryVectorStore()` | In-memory vector store |
| `vectraStore()` | Vectra-backed vector store |
| `cosine(a, b)` | Cosine similarity |
| `VectorStore`, `VectorItem`, `Hit` | Vector store types |
| `default` | Auto-configure from env |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/plugins/knowledge)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
