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
  const noApproverCtx = { approver: undefined } as unknown as Ctx;

  it("allows non-sensitive tools by default", async () => {
    const run = policyMiddleware([]);
    const tool = defineTool({
      name: "read",
      description: "",
      parameters: z.object({}),
      execute: () => Promise.resolve("ok"),
    });
    expect(await run({ tool, args: {}, ctx: noApproverCtx }, () => Promise.resolve("ok"))).toBe(
      "ok",
    );
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
    await expect(
      run({ tool, args: {}, ctx: noApproverCtx }, () => Promise.resolve("ok")),
    ).rejects.toThrow(/approval/i);
  });

  it("parses and passes validated args to rules (the prompt-injection boundary)", async () => {
    const ruleOrder: unknown[] = [];
    const run = policyMiddleware([
      (_call) => {
        // The args here should be the already-parsed, type-safe value.
        ruleOrder.push("rule-ran");
        return null; // abstain
      },
    ]);

    const tool = defineTool({
      name: "send_wei",
      description: "",
      sensitive: true,
      parameters: z.object({ to: z.string(), value: z.string() }),
      execute: (args) => Promise.resolve(args.to),
    });

    const mockApproverCtx = {
      approver: () => Promise.resolve(true),
    } as unknown as Ctx;

    const result = await run(
      { tool, args: { to: "0xabc", value: "1000000" }, ctx: mockApproverCtx },
      ({ args }) => Promise.resolve(`sent to ${(args as { to: string }).to}`),
    );

    expect(ruleOrder).toEqual(["rule-ran"]);
    expect(result).toBe("sent to 0xabc");
  });

  it("rejects malformed args that fail Zod validation", async () => {
    const run = policyMiddleware([]);
    const tool = defineTool({
      name: "send_wei",
      description: "",
      sensitive: true,
      parameters: z.object({ to: z.string(), value: z.string() }),
      execute: () => Promise.resolve("ok"),
    });

    await expect(
      run(
        // Missing required fields "to" and "value"
        { tool, args: { bad: true }, ctx: noApproverCtx },
        () => Promise.resolve("should not reach"),
      ),
    ).rejects.toThrow(/Invalid arguments for tool/);
  });

  it("lets rules deny based on parsed args", async () => {
    const run = policyMiddleware([
      (call) => {
        const args = call.args as { value: string };
        if (BigInt(args.value) > BigInt(1000)) {
          return { effect: "deny", reason: `value ${args.value} exceeds cap` };
        }
        return null;
      },
    ]);

    const tool = defineTool({
      name: "send_wei",
      description: "",
      sensitive: true,
      parameters: z.object({ to: z.string(), value: z.string() }),
      execute: () => Promise.resolve("ok"),
    });

    const mockApproverCtx = {
      approver: () => Promise.resolve(true),
    } as unknown as Ctx;

    // Below cap — allow
    await expect(
      run({ tool, args: { to: "0xabc", value: "500" }, ctx: mockApproverCtx }, () =>
        Promise.resolve("ok"),
      ),
    ).resolves.toBe("ok");

    // Above cap — deny
    await expect(
      run({ tool, args: { to: "0xabc", value: "5000" }, ctx: mockApproverCtx }, () =>
        Promise.resolve("ok"),
      ),
    ).rejects.toThrow(/Policy denied.*value 5000 exceeds cap/);
  });
});

describe("composeTool", () => {
  it("lets middleware short-circuit by throwing", async () => {
    const block: ToolMiddleware = async () => {
      throw new Error("blocked");
    };
    const stubNext = () => Promise.resolve("never" as unknown);
    // Stubs intentionally skip real types — block throws before next() runs.
    /* eslint-disable @typescript-eslint/consistent-type-assertions */
    const stubCall = { tool: {} as never, args: {}, ctx: {} as never } as Parameters<typeof run>[0];
    /* eslint-enable @typescript-eslint/consistent-type-assertions */
    const run = composeTool([block], stubNext);
    await expect(run(stubCall)).rejects.toThrow("blocked");
  });
});
