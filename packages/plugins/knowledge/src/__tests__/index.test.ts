import { describe, it, expect } from "vitest";
import { cosine, memoryVectorStore, knowledgePlugin } from "../index.js";

describe("cosine", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
  });
});

describe("memoryVectorStore", () => {
  it("returns the nearest item first", () => {
    const store = memoryVectorStore();
    store.add([
      { text: "cats are felines", embedding: [1, 0] },
      { text: "dogs bark", embedding: [0, 1] },
    ]);
    const hits = store.search([0.9, 0.1], 1);
    expect(hits[0]?.text).toBe("cats are felines");
  });

  it("returns the requested number of results", () => {
    const store = memoryVectorStore();
    store.add([
      { text: "a", embedding: [1, 0] },
      { text: "b", embedding: [0, 1] },
      { text: "c", embedding: [0.5, 0.5] },
    ]);
    expect(store.search([1, 0], 2)).toHaveLength(2);
  });

  it("returns empty when store is empty", () => {
    expect(memoryVectorStore().search([1, 0], 5)).toHaveLength(0);
  });
});

describe("knowledgePlugin", () => {
  // Fake embedder: "cat" → [1, 0], anything else → [0, 1]
  const embedder = async (texts: string[]) =>
    texts.map((t) => (t.toLowerCase().includes("cat") ? [1, 0] : [0, 1]));

  it("ingests documents and retrieves the most relevant via knowledge_search", async () => {
    const plugin = knowledgePlugin({ embedder, topK: 1 });
    await plugin.ingest(["cats are felines", "dogs are canines"]);

    const tool = plugin.tools?.find((t) => t.name === "knowledge_search");
    if (!tool) throw new Error("tool not found");

    const out = (await tool.execute({ query: "tell me about a cat" }, {} as never)) as {
      hits: Array<{ text: string; score: number }>;
    };
    expect(out.hits[0]?.text).toBe("cats are felines");
    expect(out.hits).toHaveLength(1);
  });

  it("injects relevant context via retrieval middleware", async () => {
    const plugin = knowledgePlugin({ embedder, topK: 1 });
    await plugin.ingest(["cats are independent", "dogs are loyal"]);

    // The retrieval middleware should inject context as a system message
    const mw = plugin.modelMiddleware?.[0];
    if (!mw) throw new Error("no model middleware");

    let capturedMessages: unknown[] = [];
    await mw(
      { messages: [{ role: "user", content: "what about cats?" }], tools: [] },
      async (req) => {
        capturedMessages = req.messages;
        return { finishReason: "stop", text: "ok" };
      },
    );

    const systemMsgs = capturedMessages.filter((m) => (m as { role: string }).role === "system");
    expect(systemMsgs.length).toBeGreaterThan(0);
    const content = (systemMsgs[0] as { content: string }).content;
    expect(content).toContain("cats are independent");
  });
});
