import { describe, it, expect } from "vitest";
import { viemSigner } from "../index.js";

// Anvil default key — testnet-only, never use in production
const TESTNET_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

describe("viemSigner", () => {
  it("derives a valid 0x EVM address from the private key", () => {
    const signer = viemSigner({
      privateKey: TESTNET_KEY,
      chainId: 11155111,
      rpcUrl: "http://localhost:8545",
      isTestnet: true,
    });
    expect(signer.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(signer.isTestnet).toBe(true);
    expect(signer.chainId).toBe(11155111);
  });

  it("refuses mainnet unless allowMainnet is explicitly true", () => {
    expect(() =>
      viemSigner({
        privateKey: TESTNET_KEY,
        chainId: 1,
        rpcUrl: "http://mainnet-node",
        isTestnet: false,
      }),
    ).toThrow(/mainnet.*allowMainnet/i);
  });

  it("allows mainnet when allowMainnet: true is passed", () => {
    expect(() =>
      viemSigner({
        privateKey: TESTNET_KEY,
        chainId: 1,
        rpcUrl: "http://mainnet-node",
        isTestnet: false,
        allowMainnet: true,
      }),
    ).not.toThrow();
  });
});
