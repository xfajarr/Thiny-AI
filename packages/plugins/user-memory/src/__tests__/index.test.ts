import { describe, it, expect } from "vitest";
import { loadUserMemory, saveUserMemory, finalizeSession, type UserMemory } from "../index.js";
import type { MemoryBackend, Message } from "@thiny/core";

/** In-memory backend for tests — mirrors EphemeralMemory in agent.ts */
function makeBackend(): MemoryBackend {
  const store = new Map<string, Message[]>();
  return {
    load: (id) => Promise.resolve([...(store.get(id) ?? [])]),
    append: (id, msgs) => {
      store.set(id, msgs);
      return Promise.resolve();
    },
  };
}

describe("loadUserMemory / saveUserMemory", () => {
  it("returns an empty memory for a new user", async () => {
    const backend = makeBackend();
    const mem = await loadUserMemory(backend, "alice");
    expect(mem.userId).toBe("alice");
    expect(mem.facts).toHaveLength(0);
    expect(mem.preferences).toHaveLength(0);
    expect(mem.sessionSummaries).toHaveLength(0);
  });

  it("round-trips user memory through the backend", async () => {
    const backend = makeBackend();
    const mem: UserMemory = {
      userId: "alice",
      facts: ["builds DeFi apps", "uses TypeScript"],
      preferences: ["concise responses"],
      sessionSummaries: [{ sessionId: "s1", date: "2026-05-30", summary: "Discussed EVM tools." }],
      lastUpdated: new Date().toISOString(),
    };
    await saveUserMemory(backend, mem);
    const loaded = await loadUserMemory(backend, "alice");
    expect(loaded.facts).toEqual(mem.facts);
    expect(loaded.preferences).toEqual(mem.preferences);
    expect(loaded.sessionSummaries).toHaveLength(1);
  });

  it("isolates memory between users", async () => {
    const backend = makeBackend();
    const aliceMem: UserMemory = {
      userId: "alice",
      facts: ["alice fact"],
      preferences: [],
      sessionSummaries: [],
      lastUpdated: "",
    };
    const bobMem: UserMemory = {
      userId: "bob",
      facts: ["bob fact"],
      preferences: [],
      sessionSummaries: [],
      lastUpdated: "",
    };
    await saveUserMemory(backend, aliceMem);
    await saveUserMemory(backend, bobMem);
    expect((await loadUserMemory(backend, "alice")).facts).toEqual(["alice fact"]);
    expect((await loadUserMemory(backend, "bob")).facts).toEqual(["bob fact"]);
  });
});

describe("finalizeSession", () => {
  it("stores a session summary and any extracted facts", async () => {
    const backend = makeBackend();

    // Simulate a finished session transcript
    await backend.append("alice:s1", [
      { role: "user", content: "I'm building a DeFi yield aggregator on Ethereum." },
      { role: "assistant", content: "Great! What tokens are you targeting?" },
      { role: "user", content: "Mainly USDC and ETH. I prefer TypeScript." },
      { role: "assistant", content: "Got it — I'll use TypeScript examples." },
    ]);

    // Fake model that returns structured extraction
    const fakeModel = {
      generate: async () => ({
        finishReason: "stop" as const,
        text: JSON.stringify({
          summary: "User is building a DeFi yield aggregator on Ethereum targeting USDC and ETH.",
          newFacts: ["building a DeFi yield aggregator on Ethereum", "uses USDC and ETH"],
          newPreferences: ["prefers TypeScript"],
        }),
      }),
    };

    const mem = await finalizeSession({
      model: fakeModel,
      backend,
      userId: "alice",
      sessionId: "alice:s1",
    });

    expect(mem.sessionSummaries).toHaveLength(1);
    expect(mem.sessionSummaries[0]?.summary).toContain("yield aggregator");
    expect(mem.facts).toContain("building a DeFi yield aggregator on Ethereum");
    expect(mem.preferences).toContain("prefers TypeScript");
  });

  it("deduplicates facts across multiple sessions", async () => {
    const backend = makeBackend();
    await backend.append("alice:s2", [{ role: "user", content: "still using TypeScript btw" }]);

    const fakeModel = {
      generate: async () => ({
        finishReason: "stop" as const,
        text: JSON.stringify({
          summary: "Brief follow-up.",
          newFacts: ["building a DeFi yield aggregator on Ethereum"], // already known
          newPreferences: ["prefers TypeScript"], // already known
        }),
      }),
    };

    // Pre-seed memory with existing facts
    const existing: UserMemory = {
      userId: "alice",
      facts: ["building a DeFi yield aggregator on Ethereum"],
      preferences: ["prefers TypeScript"],
      sessionSummaries: [],
      lastUpdated: "",
    };
    await saveUserMemory(backend, existing);

    const mem = await finalizeSession({
      model: fakeModel,
      backend,
      userId: "alice",
      sessionId: "alice:s2",
    });

    // Facts should not be duplicated
    expect(
      mem.facts.filter((f) => f === "building a DeFi yield aggregator on Ethereum"),
    ).toHaveLength(1);
    expect(mem.preferences.filter((p) => p === "prefers TypeScript")).toHaveLength(1);
    expect(mem.sessionSummaries).toHaveLength(1); // only the new session
  });

  it("caps session summaries at maxSummaries", async () => {
    const backend = makeBackend();
    await backend.append("s1", [{ role: "user", content: "hi" }]);

    const fakeModel = {
      generate: async () => ({
        finishReason: "stop" as const,
        text: JSON.stringify({ summary: "Brief.", newFacts: [], newPreferences: [] }),
      }),
    };

    // Pre-seed with 2 existing summaries, maxSummaries: 2
    const existing: UserMemory = {
      userId: "u1",
      facts: [],
      preferences: [],
      sessionSummaries: [
        { sessionId: "old1", date: "2026-01-01", summary: "Old 1" },
        { sessionId: "old2", date: "2026-01-02", summary: "Old 2" },
      ],
      lastUpdated: "",
    };
    await saveUserMemory(backend, existing);

    const mem = await finalizeSession({
      model: fakeModel,
      backend,
      userId: "u1",
      sessionId: "s1",
      maxSummaries: 2,
    });

    // Should have 2 summaries max — newest first, oldest dropped
    expect(mem.sessionSummaries).toHaveLength(2);
    expect(mem.sessionSummaries[0]?.sessionId).toBe("s1"); // new one is first
    expect(mem.sessionSummaries[1]?.sessionId).toBe("old1"); // old2 dropped
  });
});
