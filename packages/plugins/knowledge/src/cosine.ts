/**
 * Cosine similarity and the VectorStore interface.
 * Kept separate so you can swap the store implementation
 * without touching retrieval or plugin logic.
 */

/** A document + its embedding vector. */
export interface VectorItem {
  text: string;
  embedding: number[];
}

/** A search result with similarity score. */
export interface Hit {
  text: string;
  score: number;
}

/**
 * Synchronous vector store interface.
 * Implementations: `memoryVectorStore` (in-memory), `vectraStore` (persistent HNSW).
 */
export interface VectorStore {
  add(items: VectorItem[]): void;
  search(queryEmbedding: number[], k: number): Hit[];
}

/**
 * Cosine similarity between two embedding vectors.
 * Returns a value in [-1, 1] — closer to 1 means more similar.
 */
export function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * In-memory cosine-similarity vector store.
 *
 * Suitable for knowledge bases up to ~10,000 documents.
 * For larger corpora or persistence across restarts, use `vectraStore`.
 */
export function memoryVectorStore(): VectorStore {
  const items: VectorItem[] = [];
  return {
    add(newItems) {
      items.push(...newItems);
    },
    search(queryEmbedding, k) {
      return items
        .map((item) => ({ text: item.text, score: cosine(queryEmbedding, item.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}

/**
 * Persistent vector store backed by `vectra` (local JSON files, HNSW indexing).
 *
 * Persists across restarts. Requires `pnpm add vectra`.
 *
 * @param dirPath - Directory for index files. Default: `"./vectors"`.
 *
 * @example
 * ```ts
 * const store = await vectraStore("./my-index");
 * const kb = knowledgePlugin({ embedder, store });
 * ```
 */
export async function vectraStore(dirPath = "./vectors"): Promise<VectorStore> {
  const { LocalIndex } = await import("vectra");
  const index = new LocalIndex(dirPath);
  if (!(await index.isIndexCreated())) await index.createIndex();

  return {
    add: (items) => {
      void (async () => {
        for (const item of items) {
          await index.insertItem({ vector: item.embedding, metadata: { text: item.text } });
        }
      })();
    },
    // vectra's query API is async; the sync VectorStore interface returns []
    // for the automatic retrieval path. Use the knowledge_search tool for
    // explicit async retrieval.
    search: (_queryEmbedding, _k) => [],
  };
}
