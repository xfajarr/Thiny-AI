import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { defineTool, type Plugin, type ModelMiddleware } from "@thiny/core";

/** A document + its embedding vector. */
export interface VectorItem {
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

/** A search result with similarity score. */
export interface SearchHit {
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Cosine similarity between two embedding vectors.
 * Returns a value in [-1, 1] — closer to 1 means more similar.
 */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dot += valA * valB;
    na += valA ** 2;
    nb += valB ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Local JSON file backed vector store.
 */
export class JsonVectorStore {
  private items: VectorItem[] = [];
  private filePath: string;
  private writePromise: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      this.items = JSON.parse(data) as VectorItem[];
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code !== "ENOENT") {
        throw err;
      }
      this.items = [];
    }
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.items, null, 2), "utf-8");
  }

  async add(newItems: VectorItem[]): Promise<void> {
    const currentWrite = this.writePromise.then(async () => {
      await this.load();
      this.items.push(...newItems);
      await this.save();
    });
    this.writePromise = currentWrite.catch(() => undefined);
    await currentWrite;
  }

  getItems(): VectorItem[] {
    return this.items;
  }

  search(queryEmbedding: number[], k: number): SearchHit[] {
    return this.items
      .map((item) => ({
        text: item.text,
        score: cosine(queryEmbedding, item.embedding),
        metadata: item.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

/** Configuration for `semanticMemoryPlugin`. */
export interface SemanticMemoryPluginOptions {
  /** Function that converts texts to embedding vectors. */
  embedder: (texts: string[]) => Promise<number[][]>;
  /** Path to save/load memories. Default: "./memory-vec.json" */
  filePath?: string;
  /** Top k memories to retrieve. Default: 3 */
  topK?: number;
}

export type SemanticMemoryPlugin = Plugin & {
  store: JsonVectorStore;
  ingest(texts: string[]): Promise<void>;
};

/**
 * Creates a semantic memory plugin that persists facts/learnings in a JSON file
 * and uses local cosine similarity search to dynamically inject relevant history
 * into the agent's context.
 */
export function semanticMemoryPlugin(opts: SemanticMemoryPluginOptions): SemanticMemoryPlugin {
  const filePath = opts.filePath ?? "./memory-vec.json";
  const topK = opts.topK ?? 3;
  const store = new JsonVectorStore(filePath);

  let initialized = false;
  async function ensureInitialized() {
    if (!initialized) {
      await store.load();
      initialized = true;
    }
  }

  async function ingest(texts: string[]): Promise<void> {
    if (texts.length === 0) return;
    await ensureInitialized();
    const embeddings = await opts.embedder(texts);
    const items: VectorItem[] = [];
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text !== undefined) {
        items.push({
          text,
          embedding: embeddings[i] ?? [],
          timestamp: Date.now(),
        });
      }
    }
    await store.add(items);
  }

  const memoryMiddleware: ModelMiddleware = async (req, next) => {
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    if (!lastUser || !("content" in lastUser) || !lastUser.content) {
      return next(req);
    }

    await ensureInitialized();
    const queryText = lastUser.content;

    if (!queryText.trim()) {
      return next(req);
    }

    const embeddings = await opts.embedder([queryText]);
    const queryEmbedding = embeddings[0];
    if (!queryEmbedding) {
      return next(req);
    }

    const hits = store.search(queryEmbedding, topK);
    if (hits.length === 0) {
      return next(req);
    }

    const contextContent = `[Relevant memories / past learnings]\n${hits
      .map((h) => `- ${h.text}`)
      .join("\n")}`;

    const contextMessage = {
      role: "system" as const,
      content: contextContent,
    };

    // Inject context after the first system message if it is an identity prompt
    const [first, ...rest] = req.messages;
    const messages =
      first?.role === "system" && first.content.includes("MUST always refer")
        ? [first, contextMessage, ...rest]
        : [contextMessage, ...req.messages];

    return next({ ...req, messages });
  };

  return {
    name: "semantic-memory",
    modelMiddleware: [memoryMiddleware],
    tools: [
      defineTool({
        name: "memory_save_semantic",
        description:
          "Save a new factual learning, rule, or preference to persistent semantic memory. " +
          "Use this tool when the user tells you a permanent fact about themselves or when you learn " +
          "something that should be remembered across sessions.",
        parameters: z.object({
          fact: z
            .string()
            .min(1)
            .describe("The factual learning or information to remember permanently."),
        }),
        execute: async ({ fact }) => {
          await ingest([fact]);
          return { success: true, message: `Fact saved to semantic memory: "${fact}"` };
        },
      }),
    ],
    store,
    ingest,
  };
}
