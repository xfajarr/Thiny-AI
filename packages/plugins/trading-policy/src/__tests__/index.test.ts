import { describe, it, expect } from "vitest";
import { z } from "zod";
import { tradingPolicyRules } from "../index.js";
import { defineTool, type Ctx } from "@thiny/core";

const swapTool = defineTool({
  name: "swap_execute",
  description: "",
  sensitive: true,
  parameters: z.object({
    tokenIn: z.string(),
    tokenOut: z.string(),
    amountIn: z.string(),
    minAmountOut: z.string(),
  }),
  execute: async () => "hash",
});

const ctx = {} as unknown as Ctx;

function firstRule() {
  const rule = tradingPolicyRules({
    allowedAssets: ["0xUsdc", "0xWeth"],
    maxPositionSize: 1_000_000n,
    maxSlippageBps: 100,
  })[0];
  if (!rule) throw new Error("no rule");
  return rule;
}

describe("tradingPolicyRules", () => {
  it("denies swap for non-allowlisted asset", () => {
    const d = firstRule()({
      tool: swapTool,
      args: { tokenIn: "0xShitcoin", tokenOut: "0xUsdc", amountIn: "100", minAmountOut: "99" },
      ctx,
    });
    expect(d).toMatchObject({ effect: "deny" });
    expect(d?.reason).toMatch(/allowed assets/i);
  });

  it("denies swap exceeding position size", () => {
    const d = firstRule()({
      tool: swapTool,
      args: { tokenIn: "0xUsdc", tokenOut: "0xWeth", amountIn: "9999999", minAmountOut: "9899999" },
      ctx,
    });
    expect(d).toMatchObject({ effect: "deny" });
    expect(d?.reason).toMatch(/position/i);
  });

  it("denies swap with slippage above ceiling", () => {
    // 1_000_000 in, 500_000 out = 50% slippage >> 100bps
    const d = firstRule()({
      tool: swapTool,
      args: { tokenIn: "0xUsdc", tokenOut: "0xWeth", amountIn: "1000000", minAmountOut: "500000" },
      ctx,
    });
    expect(d).toMatchObject({ effect: "deny" });
    expect(d?.reason).toMatch(/slippage/i);
  });

  it("approves an in-policy swap", () => {
    // 1% slippage = 100bps (exactly at ceiling)
    const d = firstRule()({
      tool: swapTool,
      args: { tokenIn: "0xUsdc", tokenOut: "0xWeth", amountIn: "100", minAmountOut: "99" },
      ctx,
    });
    expect(d).toMatchObject({ effect: "approve" });
  });

  it("abstains for non-swap tools", () => {
    const other = { ...swapTool, name: "evm_get_balance" };
    expect(firstRule()({ tool: other, args: {}, ctx })).toBeNull();
  });
});
