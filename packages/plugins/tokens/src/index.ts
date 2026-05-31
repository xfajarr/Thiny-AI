/**
 * @thiny/plugin-tokens — ERC-20 token operations plugin.
 *
 * File structure:
 *   abi.ts    — ERC-20 ABI fragment + UINT256_MAX constant
 *   rules.ts  — erc20ApproveRules (deterministic policy, no viem dep)
 *   index.ts  — tokensPlugin factory + tools (this file)
 */
export { erc20ApproveRules } from "./rules.js";
export type { Erc20ApproveLimits } from "./rules.js";

import { z } from "zod";
import { formatUnits, type PublicClient } from "viem";
import { defineTool, type Tool, type Plugin } from "@thiny/core";
import type { Hex } from "@thiny/core";
import { ERC20_ABI, UINT256_MAX } from "./abi.js";

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((s) => s as Hex);

function readContract(
  client: PublicClient,
  fn: string,
  address: string,
  ...args: unknown[]
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
  return (client.readContract as any)({ address, abi: ERC20_ABI, functionName: fn, args });
}

/**
 * Read the ERC-20 balance of a wallet — returns raw units, formatted amount, and symbol.
 * Exported for composition in custom plugins.
 */
export function erc20BalanceTool(client: PublicClient): Tool {
  return defineTool({
    name: "erc20_balance",
    description:
      "Get the ERC-20 token balance of an address. Returns raw amount, formatted amount, and token symbol.",
    parameters: z.object({
      token: addressSchema.describe("token contract address"),
      owner: addressSchema.describe("wallet address"),
    }),
    execute: async ({ token, owner }) => {
      const [raw, decimals, symbol] = await Promise.all([
        readContract(client, "balanceOf", token, owner) as unknown as Promise<bigint>,
        readContract(client, "decimals", token) as unknown as Promise<number>,
        readContract(client, "symbol", token) as unknown as Promise<string>,
      ]);
      return { raw: String(raw), formatted: formatUnits(raw, decimals), symbol };
    },
  });
}

/** Options for `tokensPlugin`. */
export interface TokensPluginOptions {
  publicClient: PublicClient;
  walletClient?: { writeContract: (...args: unknown[]) => Promise<Hex> };
}

/**
 * ERC-20 token plugin.
 *
 * Tools:
 * - `erc20_balance`   — read token balance
 * - `erc20_allowance` — read current approval allowance
 * - `erc20_approve`   — **sensitive** — approve spender (unlimited always denied)
 * - `erc20_transfer`  — **sensitive** — transfer tokens
 *
 * Pair with `erc20ApproveRules` in `policyMiddleware` to enforce
 * token allowlists and amount caps.
 */
export function tokensPlugin(opts: TokensPluginOptions): Plugin {
  const { publicClient } = opts;
  return {
    name: "tokens",
    tools: [
      erc20BalanceTool(publicClient),

      defineTool({
        name: "erc20_allowance",
        description:
          "Check how many tokens a spender is currently approved to spend on behalf of an owner.",
        parameters: z.object({
          token: addressSchema,
          owner: addressSchema,
          spender: addressSchema,
        }),
        execute: async ({ token, owner, spender }) => {
          const [raw, decimals, symbol] = await Promise.all([
            readContract(
              publicClient,
              "allowance",
              token,
              owner,
              spender,
            ) as unknown as Promise<bigint>,
            readContract(publicClient, "decimals", token) as unknown as Promise<number>,
            readContract(publicClient, "symbol", token) as unknown as Promise<string>,
          ]);
          return {
            raw: String(raw),
            formatted: formatUnits(raw, decimals),
            symbol,
            isUnlimited: raw >= UINT256_MAX,
          };
        },
      }),

      defineTool({
        name: "erc20_approve",
        description:
          "Approve a spender to spend a specific capped amount of tokens. " +
          "SENSITIVE: requires policy approval. " +
          "NEVER use unlimited amounts — always specify the exact amount needed.",
        sensitive: true,
        locks: ["evm:write"],
        parameters: z.object({
          token: addressSchema.describe("token contract address"),
          spender: addressSchema.describe("spender to approve"),
          amount: z.string().regex(/^\d+$/, "decimal token amount"),
        }),
        execute: async ({ token, spender, amount }, ctx) => {
          if (!opts.walletClient) throw new Error("erc20_approve: no walletClient configured");
          ctx.logger.info(
            { event: "erc20_approve", token, spender, amount },
            `Approving ${amount} of ${token} to ${spender}`,
          );
          const hash = await opts.walletClient.writeContract({
            address: token,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [spender, BigInt(amount)],
          });
          return { hash, token, spender, amount };
        },
      }),

      defineTool({
        name: "erc20_transfer",
        description: "Transfer ERC-20 tokens to an address. SENSITIVE: requires policy approval.",
        sensitive: true,
        locks: ["evm:write"],
        parameters: z.object({
          token: addressSchema.describe("token contract address"),
          to: addressSchema.describe("recipient address"),
          amount: z.string().regex(/^\d+$/),
        }),
        execute: async ({ token, to, amount }, ctx) => {
          if (!opts.walletClient) throw new Error("erc20_transfer: no walletClient configured");
          ctx.logger.info(
            { event: "erc20_transfer", token, to, amount },
            `Transferring ${amount} of ${token} to ${to}`,
          );
          const hash = await opts.walletClient.writeContract({
            address: token,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [to, BigInt(amount)],
          });
          return { hash, token, to, amount };
        },
      }),
    ],
  };
}

export default async function (env: Record<string, string | undefined> = process.env): Promise<Plugin> {
  const { createPublicClient, http } = await import("viem");
  const { sepolia } = await import("viem/chains");
  const publicClient = createPublicClient({ chain: sepolia, transport: http(env.EVM_RPC_URL) });
  return tokensPlugin({ publicClient });
}
