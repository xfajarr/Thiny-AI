/**
 * The knowledge plugin factory and retrieval middleware.
 * Depends on: cosine.ts (store), embedder.ts (embedder type).
 */
import { z } from "zod";
import { defineTool, type Plugin, type ModelMiddleware } from "@thiny/core";
import { memoryVectorStore, type VectorStore, type Hit } from "./cosine.js";
import type { Embedder } from "./embedder.js";

export type { Embedder } from "./embedder.js";

/** Configuration for `knowledgePlugin`. */
export interface KnowledgePluginOptions {
  /**
   * Function that converts texts to embedding vectors.
   * Must return one vector per input text in the same order.
   * See `localEmbedder()` for a free offline option.
   */
  embedder: Embedder;
  /** Number of top-K documents to retrieve per query. Default: 4. */
  topK?: number;
  /** Custom vector store. Defaults to `memoryVectorStore()`. */
  store?: VectorStore;
}

/** A knowledge plugin instance with an `ingest` method to add documents. */
export type KnowledgePlugin = Plugin & {
  /** Embed and store new documents in the knowledge base. */
  ingest(texts: string[]): Promise<void>;
};

/**
 * Retrieval-Augmented Generation (RAG) plugin.
 *
 * Ingest documents once, then the agent automatically retrieves
 * the most relevant ones as context before each model call.
 *
 * **Two retrieval paths:**
 * 1. **Automatic** — retrieval middleware injects top-K relevant docs
 *    as a system message on every model call, keyed on the last user message.
 * 2. **Explicit** — the model can call `knowledge_search` at any point.
 *
 * @example
 * ```ts
 * import { knowledgePlugin, localEmbedder } from "@thiny/plugin-knowledge";
 *
 * const embedder = await localEmbedder(); // free, offline
 * const kb = knowledgePlugin({ embedder });
 * await kb.ingest(["Thiny is a lightweight AI agent framework.", ...]);
 *
 * const agent = await createAgent({ plugins: [kb], ... });
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

  const retrievalMiddleware: ModelMiddleware = async (req, next) => {
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    if (!lastUser || !("content" in lastUser) || !lastUser.content) return next(req);

    const hits = await retrieve(lastUser.content);
    if (hits.length === 0) return next(req);

    const contextContent = `[Relevant knowledge]\n${hits.map((h) => `- ${h.text}`).join("\n")}`;
    const contextMessage = { role: "system" as const, content: contextContent };

    // Inject after identity/persona messages, before the user's system prompt
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
