import type { PolicyRule } from "@thiny/core";

/** Limits applied to `evm_send_native` by `evmTransferRules`. */
export interface EvmTransferLimits {
  /** Maximum native token value per transaction, in wei. */
  maxValueWei: bigint;
  /** Lowercased destination addresses that may receive funds. */
  allowlist: string[];
}

/**
 * Deterministic policy rules for `evm_send_native`.
 *
 * Decisions are computed from parsed args only — never from model text.
 * This is the prompt-injection boundary.
 *
 * Returns a `deny` decision when:
 * - The value exceeds `maxValueWei`
 * - The destination is not in `allowlist`
 *
 * Returns an `approve` decision when both checks pass (requires explicit
 * human or headless approval before execution).
 *
 * Returns `null` (abstain) for all other tools.
 */
export function evmTransferRules(limits: EvmTransferLimits): PolicyRule[] {
  const allowedSet = new Set(limits.allowlist.map((a) => a.toLowerCase()));

  return [
    (call) => {
      if (call.tool.name !== "evm_send_native") return null;

      const args = call.args as { to: string; valueWei: string };
      const value = BigInt(args.valueWei);

      if (value > limits.maxValueWei) {
        return {
          effect: "deny",
          reason: `value ${String(value)} wei exceeds cap ${String(limits.maxValueWei)} wei`,
        };
      }

      if (!allowedSet.has(args.to.toLowerCase())) {
        return {
          effect: "deny",
          reason: `destination ${args.to} is not on the allowlist`,
        };
      }

      return {
        effect: "approve",
        reason: `send ${String(value)} wei to ${args.to} (within policy)`,
      };
    },
  ];
}
