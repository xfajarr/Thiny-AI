/**
 * Embedder type and factory functions.
 * Separated from the plugin so you can compose any embedder
 * (OpenAI API, local ONNX, custom) with any vector store.
 */

/**
 * A function that converts text strings to embedding vectors.
 * Must return one vector per input text, in the same order.
 *
 * @example using the Vercel AI SDK (OpenAI embeddings)
 * ```ts
 * import { embedMany } from "ai";
 * import { openai } from "@ai-sdk/openai";
 *
 * const embedder: Embedder = async (texts) => {
 *   const { embeddings } = await embedMany({
 *     model: openai.embedding("text-embedding-3-small"),
 *     values: texts,
 *   });
 *   return embeddings;
 * };
 * ```
 *
 * @example free local embeddings (no API key)
 * ```ts
 * import { localEmbedder } from "@thiny/plugin-knowledge/embedder";
 * const embedder = await localEmbedder();
 * ```
 */
export type Embedder = (texts: string[]) => Promise<number[][]>;

/**
 * Create a free, fully-offline embedder using `@xenova/transformers`.
 *
 * Downloads `Xenova/all-MiniLM-L6-v2` (~23 MB ONNX model) on first call,
 * then caches it locally. No API key required.
 *
 * Requires: `pnpm add @xenova/transformers`
 *
 * @throws When `@xenova/transformers` is not installed.
 *
 * @example
 * ```ts
 * import { localEmbedder } from "@thiny/plugin-knowledge/embedder";
 * import { knowledgePlugin } from "@thiny/plugin-knowledge";
 *
 * const embedder = await localEmbedder();
 * const kb = knowledgePlugin({ embedder });
 * ```
 */
export async function localEmbedder(model = "Xenova/all-MiniLM-L6-v2"): Promise<Embedder> {
  // @ts-expect-error — @xenova/transformers is an optional peer dep
  const { pipeline } = (await import("@xenova/transformers")) as {
    pipeline: (
      task: string,
      model: string,
    ) => Promise<(text: string, opts: object) => Promise<{ data: Float32Array }>>;
  };
  const pipe = await pipeline("feature-extraction", model);

  return async (texts: string[]): Promise<number[][]> => {
    const results: number[][] = [];
    for (const text of texts) {
      const output = await pipe(text, { pooling: "mean", normalize: true });
      results.push(Array.from(output.data));
    }
    return results;
  };
}

/**
 * A no-op random embedder for testing and development.
 * Does NOT produce meaningful semantic similarity — use only for smoke tests.
 *
 * @param dimensions - Vector size. Default: 384 (matches `all-MiniLM-L6-v2`).
 */
export function randomEmbedder(dimensions = 384): Embedder {
  return (texts: string[]): Promise<number[][]> =>
    Promise.resolve(texts.map(() => Array.from({ length: dimensions }, () => Math.random() - 0.5)));
}
