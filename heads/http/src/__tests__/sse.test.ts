import { describe, it, expect, vi } from "vitest";
import { sseMessage, streamChat } from "../sse.js";
import type { Agent } from "@thiny/core";

describe("sseMessage", () => {
  it("formats payload as an SSE data frame with JSON-encoded content", () => {
    expect(sseMessage({ type: "delta", text: "hi\nthere" })).toBe(
      'data: {"type":"delta","text":"hi\\nthere"}\n\n',
    );
  });

  it("handles empty payload correctly", () => {
    expect(sseMessage({ type: "done" })).toBe('data: {"type":"done"}\n\n');
  });
});

describe("streamChat", () => {
  it("writes a delta frame per token then a done frame", async () => {
    const agent = {
      run: vi.fn(async (_input: string, opts?: { onToken?: (d: string) => void }) => {
        opts?.onToken?.("Hel");
        opts?.onToken?.("lo");
        return "Hello";
      }),
      registry: {} as unknown as Agent["registry"],
      events: {} as unknown as Agent["events"],
    } as unknown as Agent;

    const chunks: string[] = [];
    await streamChat(agent, "hi", "s1", (c) => {
      chunks.push(c);
    });

    expect(chunks).toEqual([
      'data: {"type":"delta","text":"Hel"}\n\n',
      'data: {"type":"delta","text":"lo"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
  });

  it("writes an error frame when agent.run throws", async () => {
    const agent = {
      run: vi.fn(async () => {
        throw new Error("model overloaded");
      }),
      registry: {} as unknown as Agent["registry"],
      events: {} as unknown as Agent["events"],
    } as unknown as Agent;

    const chunks: string[] = [];
    await streamChat(agent, "boom", "s1", (c) => {
      chunks.push(c);
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('"type":"error"');
    expect(chunks[0]).toContain("model overloaded");
  });
});
