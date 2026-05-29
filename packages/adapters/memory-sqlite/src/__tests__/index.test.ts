import { describe, it, expect } from "vitest";
import { sqliteMemory } from "../index.js";
import type { Message } from "@thiny/core";

describe("sqliteMemory", () => {
  it("round-trips a transcript for a session", async () => {
    const mem = await sqliteMemory({ url: ":memory:" });
    const msgs: Message[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    await mem.append("s1", msgs);
    expect(await mem.load("s1")).toEqual(msgs);
  });

  it("returns empty array for an unknown session", async () => {
    const mem = await sqliteMemory({ url: ":memory:" });
    expect(await mem.load("unknown")).toEqual([]);
  });

  it("append replaces (not appends to) the stored transcript", async () => {
    const mem = await sqliteMemory({ url: ":memory:" });
    await mem.append("s1", [{ role: "user", content: "a" }]);
    await mem.append("s1", [{ role: "user", content: "b" }]);
    const result = await mem.load("s1");
    expect(result).toHaveLength(1);
    expect((result[0] as { content: string }).content).toBe("b");
  });

  it("isolates data between sessions", async () => {
    const mem = await sqliteMemory({ url: ":memory:" });
    await mem.append("s1", [{ role: "user", content: "session-one" }]);
    expect(await mem.load("s2")).toEqual([]);
  });
});
