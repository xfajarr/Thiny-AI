import { z } from "zod";
import { formatEther, type PublicClient, type Abi } from "viem";
import { defineTool, type Plugin, type Hex } from "@thiny/core";
import type { Signer } from "@thiny/core";

export { evmTransferRules, type EvmTransferLimits } from "./rules.js";

/** Address schema: validates and narrows to `Hex`. */
const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x EVM address")
  .transform((s) => s as Hex);

export interface EvmPluginOptions {
  /** Injected viem public client (required for read tools). */
  publicClient: PublicClient;
  /** Chain ID for contextual logging. */
  chainId: number;
  /** Whether this plugin is operating on a testnet. */
  isTestnet: boolean;
  /**
   * Signer for `evm_send_native`. When absent the tool throws a clear error,
   * which the model receives as an observation.
   */
  signer?: Signer;
}

/**
 * EVM plugin — read chain state and (optionally) send testnet transactions.
 *
 * Tools:
 * - `evm_get_balance` — native token balance (wei + formatted)
 * - `evm_read_contract` — call any view/pure function
 * - `evm_send_native` — sensitive; requires policy + approval
 *
 * Pair with `evmTransferRules` in `policyMiddleware` for deterministic
 * value caps and destination allowlisting.
 *
 * @example
 * ```ts
 * import { evmPlugin, evmTransferRules } from "@thiny/plugin-evm";
 * import { policyMiddleware } from "@thiny/core";
 *
 * const agent = await createAgent({
 *   model: loadThinyConfig(),
 *   plugins: [
 *     evmPlugin({ publicClient, chainId: 11155111, isTestnet: true, signer }),
 *     {
 *       name: "policy",
 *       toolMiddleware: [
 *         policyMiddleware(evmTransferRules({
 *           maxValueWei: 10_000_000_000_000_000n, // 0.01 ETH
 *           allowlist: [process.env.RECIPIENT_ADDRESS!],
 *         })),
 *       ],
 *     },
 *   ],
 * });
 * ```
 */
export function evmPlugin(opts: EvmPluginOptions): Plugin {
  return {
    name: "evm",
    tools: [
      defineTool({
        name: "evm_get_balance",
        description:
          "Get the native token (ETH) balance of an EVM address. " +
          "Returns balance in wei and formatted ETH.",
        parameters: z.object({
          address: addressSchema.describe("the 0x EVM address to check"),
        }),
        execute: async ({ address }) => {
          const wei = await opts.publicClient.getBalance({ address });
          return { wei: String(wei), eth: formatEther(wei) };
        },
      }),

      defineTool({
        name: "evm_read_contract",
        description:
          "Call a read-only (view or pure) contract function and return the result. " +
          "Requires the contract ABI and function name.",
        parameters: z.object({
          address: addressSchema.describe("contract address"),
          abi: z.array(z.unknown()).describe("the contract ABI as a JSON array"),
          functionName: z.string().describe("the view/pure function to call"),
          args: z.array(z.unknown()).default([]).describe("function arguments"),
        }),
        execute: async ({ address, abi, functionName, args }) => {
          const result = await opts.publicClient.readContract({
            address,
            abi: abi as Abi,
            functionName,
            args,
          });
          // Serialise BigInts — JSON.stringify cannot handle them natively.
          return JSON.parse(
            JSON.stringify(result, (_k, v: unknown) => (typeof v === "bigint" ? String(v) : v)),
          ) as unknown;
        },
      }),

      defineTool({
        name: "evm_send_native",
        description:
          "Send native tokens (ETH) to an address on the configured EVM chain. " +
          "SENSITIVE: requires policy approval. Always confirm the destination and amount. " +
          "Only operates on testnet unless explicitly configured otherwise.",
        sensitive: true,
        parameters: z.object({
          to: addressSchema.describe("recipient address"),
          valueWei: z.string().regex(/^\d+$/, "must be a decimal wei amount"),
        }),
        execute: async ({ to, valueWei }, ctx) => {
          if (!opts.signer) {
            throw new Error(
              "evm_send_native: no signer configured. " +
                "Pass a signer to evmPlugin() to enable sending.",
            );
          }
          if (!opts.signer.isTestnet) {
            throw new Error(
              "evm_send_native: refusing to send on mainnet. " +
                "Configure a testnet signer, or use a policy-controlled custody wallet for mainnet.",
            );
          }
          ctx.logger.info(
            { event: "evm_send", to, valueWei, chainId: opts.chainId },
            `Sending ${valueWei} wei to ${to}`,
          );
          const hash = await opts.signer.signAndSend({
            to,
            value: BigInt(valueWei),
            chainId: opts.chainId,
          });
          return { hash, to, valueWei, chainId: opts.chainId };
        },
      }),
    ],
  };
}
