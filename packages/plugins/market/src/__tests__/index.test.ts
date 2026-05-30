import { describe, it, expect, vi } from "vitest";
import { marketPlugin } from "../index.js";

const fakeFetch = vi.fn(
  async () =>
    new Response(JSON.stringify({ ethereum: { usd: 3200.5 }, solana: { usd: 145.2 } }), {
      status: 200,
    }),
);

describe("marketPlugin", () => {
  it("market_price returns prices for requested tokens", async () => {
    const plugin = marketPlugin({ fetchImpl: fakeFetch as unknown as typeof fetch });
    const tool = plugin.tools?.find((t) => t.name === "market_price");
    if (!tool) throw new Error("tool not found");
    const out = (await tool.execute(
      { ids: ["ethereum", "solana"], currency: "usd" },
      {} as never,
    )) as {
      prices: Record<string, number>;
    };
    expect(out.prices.ethereum).toBe(3200.5);
    expect(out.prices.solana).toBe(145.2);
    expect(fakeFetch).toHaveBeenCalledOnce();
  });

  it("portfolio_update and portfolio_get round-trip via ctx.state", async () => {
    const plugin = marketPlugin();
    const updateTool = plugin.tools?.find((t) => t.name === "portfolio_update");
    const getTool = plugin.tools?.find((t) => t.name === "portfolio_get");
    if (!updateTool || !getTool) throw new Error("tools not found");

    const state = new Map<string, unknown>();
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const ctx = { state } as never;

    await updateTool.execute({ token: "ETH", amount: "1.5", avgCostUsd: "3000" }, ctx);
    const out = (await getTool.execute({}, ctx)) as { positions: unknown[] };
    expect(out.positions).toHaveLength(1);
    expect((out.positions[0] as { token: string }).token).toBe("ETH");
  });

  it("market_price throws on non-OK HTTP status", async () => {
    const badFetch = vi.fn(async () => new Response("", { status: 429 }));
    const plugin = marketPlugin({ fetchImpl: badFetch as unknown as typeof fetch });
    const tool = plugin.tools?.find((t) => t.name === "market_price");
    if (!tool) throw new Error("tool not found");
    await expect(tool.execute({ ids: ["bitcoin"] }, {} as never)).rejects.toThrow(/429/);
  });
});
