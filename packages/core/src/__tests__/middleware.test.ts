import { describe, it, expect } from "vitest";
import { z } from "zod";
import { composeModel, composeTool } from "../compose.js";
import { budgetMiddleware } from "../middleware/budget.js";
import { policyMiddleware } from "../middleware/policy.js";
import { defineTool } from "../tool.js";
import type { ModelMiddleware, ToolMiddleware } from "../middleware.js";
import type { Ctx } from "../context.js";

describe("composeModel", () => {
  it("runs middleware outside-in (onion order)", async () => {
    const order: string[] = [];
    const a: ModelMiddleware = async (req, next) => {
      order.push("a-before");
      const r = await next(req);
      order.push("a-after");
      return r;
    };
    const b: ModelMiddleware = async (req, next) => {
      order.push("b-before");
      const r = await next(req);
      order.push("b-after");
      return r;
    };
    const run = composeModel([a, b], async () => {
      order.push("base");
      return { finishReason: "stop" as const };
    });
    await run({ messages: [], tools: [] });
    expect(order).toEqual(["a-before", "b-before", "base", "b-after", "a-after"]);
  });
});

describe("budgetMiddleware", () => {
  it("throws when token cap is exceeded", async () => {
    const mw = budgetMiddleware({ maxTokens: 100 });
    const next = async () => ({
      finishReason: "stop" as const,
      usage: { inputTokens: 80, outputTokens: 40 },
    });
    await expect(mw({ messages: [], tools: [] }, next)).rejects.toThrow(/budget/i);
  });

  it("allows calls under the cap", async () => {
    const mw = budgetMiddleware({ maxTokens: 1000 });
    const next = async () => ({
      finishReason: "stop" as const,
      usage: { inputTokens: 10, outputTokens: 10 },
    });
    await expect(mw({ messages: [], tools: [] }, next)).resolves.toMatchObject({
      finishReason: "stop",
    });
  });
});

describe("policyMiddleware", () => {
  const ctx = { approver: undefined } as unknown as Ctx;

  it("allows non-sensitive tools by default", async () => {
    const run = policyMiddleware([]);
    const tool = defineTool({
      name: "read",
      description: "",
      parameters: z.object({}),
      execute: () => Promise.resolve("ok"),
    });
    expect(await run({ tool, args: {}, ctx }, () => Promise.resolve("ok"))).toBe("ok");
  });

  it("blocks sensitive tools when no approver is set", async () => {
    const run = policyMiddleware([]);
    const tool = defineTool({
      name: "send",
      description: "",
      sensitive: true,
      parameters: z.object({}),
      execute: () => Promise.resolve("ok"),
    });
    await expect(run({ tool, args: {}, ctx }, () => Promise.resolve("ok"))).rejects.toThrow(
      /approval/i,
    );
  });
});

describe("composeTool", () => {
  it("lets middleware short-circuit by throwing", async () => {
    const block: ToolMiddleware = async () => {
      throw new Error("blocked");
    };
    const stubNext = () => Promise.resolve("never" as unknown);
    // Cast through unknown — these are unreachable stubs; the middleware throws before next() runs.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const stubCall = { tool: {} as never, args: {}, ctx: {} as never } as Parameters<typeof run>[0];
    const run = composeTool([block], stubNext);
    await expect(run(stubCall)).rejects.toThrow("blocked");
  });
});
