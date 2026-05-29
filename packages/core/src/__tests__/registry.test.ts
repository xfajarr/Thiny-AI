import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../registry.js";
import { defineTool } from "../tool.js";

const echo = defineTool({
  name: "echo",
  description: "echo back",
  parameters: z.object({ text: z.string() }),
  execute: async ({ text }) => text,
});

describe("ToolRegistry", () => {
  it("registers and retrieves a tool", () => {
    const r = new ToolRegistry();
    r.register(echo);
    expect(r.get("echo").name).toBe("echo");
    expect(r.all()).toHaveLength(1);
  });

  it("rejects duplicate names", () => {
    const r = new ToolRegistry();
    r.register(echo);
    expect(() => {
      r.register(echo);
    }).toThrow(/Tool already registered/);
  });

  it("throws a clear error for unknown tools", () => {
    const r = new ToolRegistry();
    expect(() => r.get("nope")).toThrow(/Unknown tool.*nope/);
  });
});
