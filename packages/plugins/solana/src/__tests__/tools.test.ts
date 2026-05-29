import { describe, it, expect } from "vitest";
import { solanaPlugin } from "../index.js";
import type { Connection } from "@solana/web3.js";

const fakeConnection = {
  getBalance: async () => 1_500_000_000, // 1.5 SOL in lamports
} as unknown as Connection;

describe("solanaPlugin tools", () => {
  it("solana_get_balance returns lamports and SOL", async () => {
    const plugin = solanaPlugin({ connection: fakeConnection });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tool = plugin.tools!.find((t) => t.name === "solana_get_balance")!;
    const out = (await tool.execute(
      { owner: "11111111111111111111111111111111" },
      {} as never,
    )) as { lamports: string; sol: number };
    expect(out.lamports).toBe("1500000000");
    expect(out.sol).toBeCloseTo(1.5);
  });

  it("solana_send_sol is marked sensitive", () => {
    const plugin = solanaPlugin({ connection: fakeConnection });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tool = plugin.tools!.find((t) => t.name === "solana_send_sol")!;
    expect(tool.sensitive).toBe(true);
  });
});
