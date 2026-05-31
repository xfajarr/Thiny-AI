import { policyMiddleware, type PolicyRule, type Plugin } from "@thiny/core";

const SWAP_TOOLS = new Set(["swap_execute", "sol_swap_execute", "erc20_approve", "erc20_transfer"]);

/** Limits for trading-related policy rules. */
export interface TradingPolicyOptions {
  /** Asset addresses (lowercased) that may be traded. */
  allowedAssets: string[];
  /** Maximum single-trade position size in base units. */
  maxPositionSize: bigint;
  /** Maximum slippage tolerance in basis points (100 = 1%). */
  maxSlippageBps: number;
}

/**
 * Deterministic policy rules for trading tools (`swap_execute`, token ops, etc.).
 *
 * Enforces:
 * - **Asset allowlist:** only listed assets may be traded
 * - **Position size cap:** single trade cannot exceed `maxPositionSize`
 * - **Slippage ceiling:** implied slippage from `amountIn` vs `minAmountOut` is capped
 *
 * Returns `null` (abstain) for non-trading tools.
 *
 * @example
 * ```ts
 * policyMiddleware(tradingPolicyRules({
 *   allowedAssets: [USDC_ADDRESS, WETH_ADDRESS],
 *   maxPositionSize: 1_000_000n,
 *   maxSlippageBps: 100,  // 1%
 * }))
 * ```
 */
export function tradingPolicyRules(opts: TradingPolicyOptions): PolicyRule[] {
  const allowed = new Set(opts.allowedAssets.map((a) => a.toLowerCase()));

  return [
    (call) => {
      if (!SWAP_TOOLS.has(call.tool.name)) return null;

      const args = call.args as {
        tokenIn?: string;
        tokenOut?: string;
        amountIn?: string;
        minAmountOut?: string;
        token?: string;
        amount?: string;
      };

      // Asset allowlist check
      const assetsToCheck = [args.tokenIn, args.tokenOut, args.token].filter(Boolean) as string[];
      for (const asset of assetsToCheck) {
        if (!allowed.has(asset.toLowerCase())) {
          return { effect: "deny", reason: `${asset} is not in the allowed assets list` };
        }
      }

      // Position size check
      const amountIn = BigInt(args.amountIn ?? args.amount ?? "0");
      if (amountIn > opts.maxPositionSize) {
        return {
          effect: "deny",
          reason: `position size ${String(amountIn)} exceeds cap ${String(opts.maxPositionSize)}`,
        };
      }

      // Slippage check (only for swap tools with both amountIn and minAmountOut)
      if (args.amountIn && args.minAmountOut) {
        const minOut = BigInt(args.minAmountOut);
        const impliedSlippageBps =
          amountIn > 0n ? Number(((amountIn - minOut) * 10_000n) / amountIn) : 0;
        if (impliedSlippageBps > opts.maxSlippageBps) {
          return {
            effect: "deny",
            reason: `implied slippage ${String(impliedSlippageBps)}bps exceeds ceiling ${String(opts.maxSlippageBps)}bps`,
          };
        }
      }

      return {
        effect: "approve",
        reason: `trade approved: ${String(amountIn)} of allowed asset`,
      };
    },
  ];
}

export default function (env: Record<string, string | undefined> = process.env): Plugin {
  const allowedAssets = (env.ALLOWED_ASSETS ?? "").split(",").filter(Boolean);
  return {
    name: "trading-policy",
    toolMiddleware: [
      policyMiddleware(
        tradingPolicyRules({
          allowedAssets,
          maxPositionSize: BigInt(env.MAX_POSITION_SIZE ?? "1000000"),
          maxSlippageBps: Number(env.MAX_SLIPPAGE_BPS ?? "100"),
        }),
      ),
    ],
  };
}
