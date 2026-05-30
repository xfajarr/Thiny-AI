import { describe, it, expect } from "vitest";
import { erc20BalanceTool, erc20ApproveRules } from "../index.js";
import type { Tool, Ctx } from "@thiny/core";
import type { PublicClient } from "viem";
import type { Ctx } from "@thiny/core";

const fakeClient: PublicClient = {
  readContract: async ({ functionName }: { functionName: string }) => {
    if (functionName === "balanceOf") return 2_000_000_000n; // 2 USDC (6 decimals)
    if (functionName === "decimals") return 6;
    if (functionName === "symbol") return "USDC";
    if (functionName === "allowance") return 0n;
    return null;
  },
} as unknown as PublicClient;

describe("erc20BalanceTool", () => {
  it("returns raw amount + formatted + symbol", async () => {
    const tool = erc20BalanceTool(fakeClient);
    const out = (await tool.execute({ token: "0xUsdc", owner: "0xOwner" }, {} as never)) as {
      raw: string;
      formatted: string;
      symbol: string;
    };
    expect(out.raw).toBe("2000000000");
    expect(out.formatted).toBe("2000");
    expect(out.symbol).toBe("USDC");
  });
});

describe("erc20ApproveRules", () => {
  const ctx = {} as unknown as Ctx;
  const rules = erc20ApproveRules({
    allowedTokens: ["0xUsdc"],
    allowedSpenders: ["0xRouter"],
    maxApproveAmount: 1_000_000n,
  });

  function firstRule() {
    const rule = rules[0];
    if (!rule) throw new Error("no rules");
    return rule;
  }

  it("denies unlimited approval (classic footgun)", () => {
    const d = firstRule()({
      tool: { name: "erc20_approve", sensitive: true } as unknown as Tool,
      args: { token: "0xUsdc", spender: "0xRouter", amount: String(2n ** 256n - 1n) },
      ctx,
    });
    expect(d).toMatchObject({ effect: "deny" });
    expect(d?.reason).toMatch(/unlimited/i);
  });

  it("denies when token not on allowlist", () => {
    const d = firstRule()({
      tool: { name: "erc20_approve", sensitive: true } as unknown as Tool,
      args: { token: "0xOther", spender: "0xRouter", amount: "100" },
      ctx,
    });
    expect(d).toMatchObject({ effect: "deny" });
  });

  it("approves an in-policy approval", () => {
    const d = firstRule()({
      tool: { name: "erc20_approve", sensitive: true } as unknown as Tool,
      args: { token: "0xUsdc", spender: "0xRouter", amount: "100" },
      ctx,
    });
    expect(d).toMatchObject({ effect: "approve" });
  });
});
