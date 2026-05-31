/**
 * @thiny/plugin-knowledge — RAG (Retrieval-Augmented Generation) plugin.
 *
 * File structure:
 *   cosine.ts   — VectorStore interface, cosine similarity, memoryVectorStore, vectraStore
 *   embedder.ts — Embedder type, localEmbedder (free/offline), randomEmbedder
 *   plugin.ts   — knowledgePlugin factory + retrieval middleware
 *   index.ts    — public barrel (this file)
 */

// Vector store primitives
export { cosine, memoryVectorStore, vectraStore } from "./cosine.js";
export type { VectorStore, VectorItem, Hit } from "./cosine.js";

// Embedders
export { localEmbedder, randomEmbedder } from "./embedder.js";
export type { Embedder } from "./embedder.js";

// Plugin
import { knowledgePlugin } from "./plugin.js";
export { knowledgePlugin };
export type { KnowledgePlugin, KnowledgePluginOptions } from "./plugin.js";

/**
 * Convenience factory: knowledge plugin with free local embeddings.
 * Zero API keys, fully offline after first model download (~23 MB).
 * Requires: `pnpm add @xenova/transformers`
 */
export async function freeKnowledgePlugin(opts: { topK?: number } = {}) {
  const { localEmbedder, randomEmbedder } = await import("./embedder.js");
  const { knowledgePlugin } = await import("./plugin.js");
  let embedder;
  try {
    embedder = await localEmbedder();
  } catch {
    embedder = randomEmbedder();
  }
  return knowledgePlugin({ embedder, topK: opts.topK });
}

export default function (_env: Record<string, string | undefined> = process.env) {
  const embedder = (texts: string[]): Promise<number[][]> =>
    Promise.resolve(texts.map(() => Array.from({ length: 4 }, () => Math.random())));
  return knowledgePlugin({ embedder });
}
