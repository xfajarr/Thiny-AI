# @thiny/memory-vec

> Vector memory adapter for semantic search and RAG

[![npm](https://img.shields.io/npm/v/@thiny/memory-vec)](https://www.npmjs.com/package/@thiny/memory-vec)

## Install

```bash
pnpm add @thiny/memory-vec
```

## Usage

```ts
import { semanticMemoryPlugin, JsonVectorStore } from "@thiny/memory-vec";

const store = new JsonVectorStore();
store.add("Ethereum is a decentralized blockchain", [0.1, 0.2, 0.3]);
const results = store.search([0.1, 0.2, 0.3], { topK: 3 });
```

## Public API

| Export | Description |
|--------|-------------|
| `semanticMemoryPlugin(opts)` | Semantic memory plugin for RAG |
| `JsonVectorStore` | JSON-file-backed vector store |
| `cosine(a, b)` | Cosine similarity between two vectors |
| `VectorItem` | `{ text, embedding, metadata?, timestamp? }` |
| `SearchHit` | `{ text, score, metadata? }` |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/adapters/memory-vec)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
