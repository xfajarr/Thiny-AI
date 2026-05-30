import { z } from "zod";
import { formatUnits, type PublicClient } from "viem";
import { defineTool, type Tool, type Plugin, type PolicyRule } from "@thiny/core";
import type { Hex } from "@thiny/core";

// ── ABI ───────────────────────────────────────────────────────────────────────

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "decimals",
    type: "function",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
  {
    name: "symbol",
    type: "function",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const UNLIMITED = 2n ** 256n - 1n;

// ── Policy rules ──────────────────────────────────────────────────────────────

/** Limits for `erc20_approve`. */
export interface Erc20ApproveLimits {
  /** ERC-20 token addresses (lowercase) that may be approved. */
  allowedTokens: string[];
  /** Spender addresses (lowercase) that may receive approval. */
  allowedSpenders: string[];
  /** Maximum approval amount. Unlimited approvals (`2^256 - 1`) are always denied. */
  maxApproveAmount: bigint;
}

/**
 * Policy rules for `erc20_approve`.
 *
 * Kills the "unlimited approval" footgun: even if the model requests
 * `type(uint256).max`, this rule denies it and explains why.
 */
export function erc20ApproveRules(limits: Erc20ApproveLimits): PolicyRule[] {
  const tokens = new Set(limits.allowedTokens.map((t) => t.toLowerCase()));
  const spenders = new Set(limits.allowedSpenders.map((s) => s.toLowerCase()));

  return [
    (call) => {
      if (call.tool.name !== "erc20_approve") return null;
      const args = call.args as { token: string; spender: string; amount: string };
      const amount = BigInt(args.amount);

      if (amount >= UNLIMITED) {
        return {
          effect: "deny",
          reason: "unlimited approval (2^256-1) is never permitted — use a specific amount",
        };
      }
      if (amount > limits.maxApproveAmount) {
        return {
          effect: "deny",
          reason: `amount ${String(amount)} exceeds cap ${String(limits.maxApproveAmount)}`,
        };
      }
      if (!tokens.has(args.token.toLowerCase())) {
        return { effect: "deny", reason: `token ${args.token} not on allowed token list` };
      }
      if (!spenders.has(args.spender.toLowerCase())) {
        return { effect: "deny", reason: `spender ${args.spender} not on allowed spender list` };
      }
      return {
        effect: "approve",
        reason: `approve ${String(amount)} of ${args.token} to ${args.spender}`,
      };
    },
  ];
}

// ── Individual tools (exported for composition) ───────────────────────────────

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((s) => s as Hex);

function readContract(client: PublicClient, fn: string, address: Hex, ...args: unknown[]) {
  return client.readContract({ address, abi: ERC20_ABI, functionName: fn, args });
}

/**
 * Read an ERC-20 token balance — returns raw wei, formatted amount, and symbol.
 * Exported so you can compose it into a custom plugin.
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
        readContract(client, "balanceOf", token, owner) as Promise<bigint>,
        readContract(client, "decimals", token) as Promise<number>,
        readContract(client, "symbol", token) as Promise<string>,
      ]);
      return { raw: String(raw), formatted: formatUnits(raw, decimals), symbol };
    },
  });
}

// ── Plugin factory ────────────────────────────────────────────────────────────

export interface TokensPluginOptions {
  /** viem public client for reading on-chain data. */
  publicClient: PublicClient;
  /** Optional wallet client for write operations (approve, transfer). */
  walletClient?: { writeContract: (...args: unknown[]) => Promise<Hex> };
}

/**
 * ERC-20 token plugin.
 *
 * Tools:
 * - `erc20_balance` — read token balance (raw + formatted + symbol)
 * - `erc20_allowance` — read current approval allowance
 * - `erc20_approve` — **sensitive** — approve spender (capped, unlimited denied)
 * - `erc20_transfer` — **sensitive** — transfer tokens
 *
 * Pair with `erc20ApproveRules` in `policyMiddleware` to enforce token
 * allowlists and amount caps, and to block unlimited approvals.
 *
 * @example
 * ```ts
 * import { tokensPlugin, erc20ApproveRules, policyMiddleware } from "@thiny/plugin-tokens";
 *
 * const agent = await createAgent({
 *   plugins: [
 *     tokensPlugin({ publicClient }),
 *     { name: "policy", toolMiddleware: [policyMiddleware(erc20ApproveRules({
 *       allowedTokens: [USDC_ADDRESS],
 *       allowedSpenders: [ROUTER_ADDRESS],
 *       maxApproveAmount: 1_000_000n,
 *     }))] },
 *   ],
 * });
 * ```
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
            readContract(publicClient, "allowance", token, owner, spender) as Promise<bigint>,
            readContract(publicClient, "decimals", token) as Promise<number>,
            readContract(publicClient, "symbol", token) as Promise<string>,
          ]);
          return {
            raw: String(raw),
            formatted: formatUnits(raw, decimals),
            symbol,
            isUnlimited: raw >= UNLIMITED,
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
        parameters: z.object({
          token: addressSchema.describe("token contract address"),
          spender: addressSchema.describe("spender to approve"),
          amount: z.string().regex(/^\d+$/, "decimal token amount (not wei for readability)"),
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
        parameters: z.object({
          token: addressSchema.describe("token contract address"),
          to: addressSchema.describe("recipient address"),
          amount: z.string().regex(/^\d+$/, "decimal token amount"),
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
