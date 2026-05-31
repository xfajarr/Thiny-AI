import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { cosine, JsonVectorStore, semanticMemoryPlugin } from "../index.js";

const TEST_FILE_PATH = path.join(__dirname, "test-memory-vec.json");

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

describe("JsonVectorStore", () => {
  beforeEach(async () => {
    try {
      await fs.unlink(TEST_FILE_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    try {
      await fs.unlink(TEST_FILE_PATH);
    } catch {
      // Ignore
    }
  });

  it("saves and loads items correctly", async () => {
    const store = new JsonVectorStore(TEST_FILE_PATH);
    await store.load(); // should initialize empty
    expect(store.getItems()).toHaveLength(0);

    await store.add([
      { text: "cats are felines", embedding: [1, 0] },
      { text: "dogs bark", embedding: [0, 1] },
    ]);

    expect(store.getItems()).toHaveLength(2);

    const store2 = new JsonVectorStore(TEST_FILE_PATH);
    await store2.load();
    expect(store2.getItems()).toHaveLength(2);
    expect(store2.getItems()[0]?.text).toBe("cats are felines");
  });

  it("returns the nearest item first", () => {
    const store = new JsonVectorStore(TEST_FILE_PATH);
    // Add items in-memory manually for search test
    void store.add([
      { text: "cats are felines", embedding: [1, 0] },
      { text: "dogs bark", embedding: [0, 1] },
    ]);

    const hits = store.search([0.9, 0.1], 1);
    expect(hits[0]?.text).toBe("cats are felines");
  });
});

describe("semanticMemoryPlugin", () => {
  const TEST_PLUGIN_FILE_PATH = path.join(__dirname, "test-plugin-memory.json");
  // Fake embedder: "cat" → [1, 0], anything else → [0, 1]
  const embedder = async (texts: string[]) =>
    texts.map((t) => (t.toLowerCase().includes("cat") ? [1, 0] : [0, 1]));

  beforeEach(async () => {
    try {
      await fs.unlink(TEST_PLUGIN_FILE_PATH);
    } catch {
      // Ignore
    }
  });

  afterEach(async () => {
    try {
      await fs.unlink(TEST_PLUGIN_FILE_PATH);
    } catch {
      // Ignore
    }
  });

  it("saves facts using memory_save_semantic tool", async () => {
    const plugin = semanticMemoryPlugin({
      embedder,
      filePath: TEST_PLUGIN_FILE_PATH,
      topK: 1,
    });

    const tool = plugin.tools?.find((t) => t.name === "memory_save_semantic");
    if (!tool) throw new Error("tool not found");

    const result = await tool.execute({ fact: "cats sleep a lot" }, {} as never);
    expect(result).toEqual({
      success: true,
      message: 'Fact saved to semantic memory: "cats sleep a lot"',
    });

    expect(plugin.store.getItems()).toHaveLength(1);
    expect(plugin.store.getItems()[0]?.text).toBe("cats sleep a lot");
  });

  it("injects relevant context via retrieval middleware", async () => {
    const plugin = semanticMemoryPlugin({
      embedder,
      filePath: TEST_PLUGIN_FILE_PATH,
      topK: 1,
    });

    await plugin.ingest(["cats are independent", "dogs are loyal"]);

    const mw = plugin.modelMiddleware?.[0];
    if (!mw) throw new Error("no model middleware");

    let capturedMessages: any[] = [];
    await mw(
      { messages: [{ role: "user", content: "tell me about cats" }], tools: [] },
      async (req) => {
        capturedMessages = req.messages;
        return { finishReason: "stop", text: "ok" };
      },
    );

    const systemMsgs = capturedMessages.filter((m) => m.role === "system");
    expect(systemMsgs.length).toBeGreaterThan(0);
    const content = systemMsgs[0]?.content;
    expect(content).toContain("cats are independent");
    expect(content).not.toContain("dogs are loyal");
  });
});
