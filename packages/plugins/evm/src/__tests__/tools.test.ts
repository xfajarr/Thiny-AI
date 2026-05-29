import { describe, it, expect } from "vitest";
import { evmPlugin } from "../index.js";
import type { PublicClient } from "viem";

const fakeClient = {
  getBalance: async () => 1_500_000_000_000_000_000n, // 1.5 ETH
  readContract: async () => BigInt(42),
} as unknown as PublicClient;

describe("evmPlugin tools", () => {
  it("evm_get_balance returns wei and formatted ETH", async () => {
    const plugin = evmPlugin({ publicClient: fakeClient, chainId: 11155111, isTestnet: true });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tool = plugin.tools!.find((t) => t.name === "evm_get_balance")!;
    const out = (await tool.execute({ address: "0xabc" }, {} as never)) as {
      wei: string;
      eth: string;
    };
    expect(out.wei).toBe("1500000000000000000");
    expect(out.eth).toBe("1.5");
  });

  it("evm_read_contract returns serialised result", async () => {
    const plugin = evmPlugin({ publicClient: fakeClient, chainId: 11155111, isTestnet: true });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tool = plugin.tools!.find((t) => t.name === "evm_read_contract")!;
    const out = await tool.execute(
      {
        address: "0xContract",
        abi: [
          {
            name: "answer",
            type: "function",
            inputs: [],
            outputs: [{ type: "uint256" }],
            stateMutability: "view",
          },
        ],
        functionName: "answer",
        args: [],
      },
      {} as never,
    );
    expect(out).toBe("42"); // BigInt serialised as string
  });

  it("evm_send_native is marked sensitive", () => {
    const plugin = evmPlugin({ publicClient: fakeClient, chainId: 11155111, isTestnet: true });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tool = plugin.tools!.find((t) => t.name === "evm_send_native")!;
    expect(tool.sensitive).toBe(true);
  });
});
