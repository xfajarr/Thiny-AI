import { z } from "zod";
import { defineTool, type Plugin, type ModelMiddleware } from "@thiny/core";

// ── Cosine similarity ─────────────────────────────────────────────────────────

/**
 * Cosine similarity between two vectors. Returns a value in [-1, 1].
 * Values closer to 1 indicate higher semantic similarity.
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

// ── Vector store ──────────────────────────────────────────────────────────────

export interface VectorItem {
  text: string;
  embedding: number[];
}

export interface Hit {
  text: string;
  score: number;
}

export interface VectorStore {
  add(items: VectorItem[]): void;
  search(queryEmbedding: number[], k: number): Hit[];
}

/**
 * In-memory cosine-similarity vector store.
 *
 * Suitable for knowledge bases with < ~10,000 documents. For larger corpora,
 * swap this out for a proper vector database (pgvector, Qdrant, etc.) behind
 * the same `VectorStore` interface.
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

// ── Embedder type ─────────────────────────────────────────────────────────────

/**
 * Function that converts text strings to embedding vectors.
 * Inject your own embedder — OpenAI `text-embedding-3-small`, Ollama, etc.
 * Injecting makes the plugin fully testable offline with fake embeddings.
 *
 * @example using the Vercel AI SDK
 * ```ts
 * import { embedMany } from "ai";
 * import { openai } from "@ai-sdk/openai";
 *
 * const embedder: Embedder = async (texts) => {
 *   const { embeddings } = await embedMany({ model: openai.embedding("text-embedding-3-small"), values: texts });
 *   return embeddings;
 * };
 * ```
 */
export type Embedder = (texts: string[]) => Promise<number[][]>;

// ── Options ───────────────────────────────────────────────────────────────────

export interface KnowledgePluginOptions {
  /**
   * Function that converts texts to embedding vectors.
   * Must return one vector per input text, in the same order.
   */
  embedder: Embedder;
  /** Number of top-K documents to retrieve per query. Default: 4. */
  topK?: number;
  /** Custom vector store. Defaults to `memoryVectorStore()`. */
  store?: VectorStore;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

/** A knowledge plugin with an `ingest` method to add documents. */
export type KnowledgePlugin = Plugin & {
  /** Embed and store new documents in the knowledge base. */
  ingest(texts: string[]): Promise<void>;
};

/**
 * Retrieval-Augmented Generation (RAG) plugin.
 *
 * Ingest documents, embed them, and automatically inject the most relevant
 * ones as a system message before each model call. Also exposes a
 * `knowledge_search` tool the model can call explicitly.
 *
 * **Two retrieval paths:**
 * 1. **Automatic** — retrieval middleware injects relevant context on every
 *    model call, based on the last user message.
 * 2. **Explicit** — the model can call `knowledge_search` to retrieve context
 *    at any point during a run.
 *
 * @example
 * ```ts
 * const embedder = async (texts) => {
 *   const { embeddings } = await embedMany({ model: openai.embedding("text-embedding-3-small"), values: texts });
 *   return embeddings;
 * };
 *
 * const kb = await knowledgePlugin({ embedder });
 * await kb.ingest(["Thiny is a lightweight AI agent framework.", "It uses a plugin system."]);
 *
 * const agent = await createAgent({
 *   model: loadThinyConfig(),
 *   plugins: [kb],
 * });
 * ```
 */
export function knowledgePlugin(opts: KnowledgePluginOptions): KnowledgePlugin {
  const topK = opts.topK ?? 4;
  const store = opts.store ?? memoryVectorStore();

  async function ingest(texts: string[]): Promise<void> {
    if (texts.length === 0) return;
    const embeddings = await opts.embedder(texts);
    store.add(texts.map((text, i) => ({ text, embedding: embeddings[i] ?? [] })));
  }

  async function retrieve(query: string): Promise<Hit[]> {
    const [embedding] = await opts.embedder([query]);
    if (!embedding) return [];
    return store.search(embedding, topK);
  }

  /** Retrieval middleware — injects context before each model call. */
  const retrievalMiddleware: ModelMiddleware = async (req, next) => {
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    if (!lastUser || !("content" in lastUser) || !lastUser.content) return next(req);

    const hits = await retrieve(lastUser.content);
    if (hits.length === 0) return next(req);

    const contextContent = `[Relevant knowledge]\n${hits.map((h) => `- ${h.text}`).join("\n")}`;
    const contextMessage = { role: "system" as const, content: contextContent };

    // Inject after identity/persona messages but before the user's system prompt
    const [first, ...rest] = req.messages;
    const messages =
      first?.role === "system" && first.content.includes("MUST always refer")
        ? [first, contextMessage, ...rest]
        : [contextMessage, ...req.messages];

    return next({ ...req, messages });
  };

  return {
    name: "knowledge",
    modelMiddleware: [retrievalMiddleware],
    tools: [
      defineTool({
        name: "knowledge_search",
        description:
          "Search the ingested knowledge base for relevant passages. " +
          "Use when you need to look up specific information from the documents that were provided.",
        parameters: z.object({
          query: z.string().min(1).describe("The search query"),
        }),
        execute: async ({ query }) => {
          const hits = await retrieve(query);
          return { hits, count: hits.length };
        },
      }),
    ],
    ingest,
  };
}
