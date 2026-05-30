/**
 * Deterministic policy rules for ERC-20 write operations.
 * Separated from tools so rules can be imported and tested independently.
 */
import type { PolicyRule } from "@thiny/core";
import { UINT256_MAX } from "./abi.js";

/** Limits enforced on `erc20_approve`. */
export interface Erc20ApproveLimits {
  /** Token addresses (lowercased) that may be approved. */
  allowedTokens: string[];
  /** Spender addresses (lowercased) that may receive approval. */
  allowedSpenders: string[];
  /**
   * Maximum approval amount in base units.
   * Unlimited approvals (`2^256 - 1`) are ALWAYS denied regardless of this value.
   */
  maxApproveAmount: bigint;
}

/**
 * Policy rules for `erc20_approve` and `erc20_transfer`.
 *
 * Key safety: unlimited approval (`type(uint256).max`) is **always denied**.
 * This kills the #1 DeFi security footgun — infinite approvals — even if
 * the model requests it.
 */
export function erc20ApproveRules(limits: Erc20ApproveLimits): PolicyRule[] {
  const tokens = new Set(limits.allowedTokens.map((t) => t.toLowerCase()));
  const spenders = new Set(limits.allowedSpenders.map((s) => s.toLowerCase()));

  return [
    (call) => {
      if (call.tool.name !== "erc20_approve") return null;
      const args = call.args as { token: string; spender: string; amount: string };
      const amount = BigInt(args.amount);

      if (amount >= UINT256_MAX) {
        return {
          effect: "deny",
          reason:
            "unlimited approval (2^256-1) is never permitted — specify the exact amount needed",
        };
      }
      if (amount > limits.maxApproveAmount) {
        return {
          effect: "deny",
          reason: `amount ${String(amount)} exceeds cap ${String(limits.maxApproveAmount)}`,
        };
      }
      if (!tokens.has(args.token.toLowerCase())) {
        return { effect: "deny", reason: `token ${args.token} not on allowed list` };
      }
      if (!spenders.has(args.spender.toLowerCase())) {
        return { effect: "deny", reason: `spender ${args.spender} not on allowed list` };
      }
      return {
        effect: "approve",
        reason: `approve ${String(amount)} of ${args.token} to ${args.spender}`,
      };
    },
  ];
}
