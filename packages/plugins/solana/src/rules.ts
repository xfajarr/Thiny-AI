import type { PolicyRule } from "@thiny/core";

/** Limits applied to `solana_send_sol` by `solanaTransferRules`. */
export interface SolanaTransferLimits {
  /** Maximum native SOL value per transaction, in lamports (1 SOL = 1_000_000_000 lamports). */
  maxLamports: bigint;
  /** Destination public keys (base58) that may receive SOL. */
  allowlist: string[];
}

/**
 * Deterministic policy rules for `solana_send_sol`.
 *
 * Decisions are computed from parsed args only — never from model text.
 *
 * Returns `deny` when: lamports > maxLamports, or destination not in allowlist.
 * Returns `approve` when both checks pass.
 * Returns `null` (abstain) for all other tools.
 */
export function solanaTransferRules(limits: SolanaTransferLimits): PolicyRule[] {
  const allowedSet = new Set(limits.allowlist);

  return [
    (call) => {
      if (call.tool.name !== "solana_send_sol") return null;

      const args = call.args as { to: string; lamports: string };
      const lamports = BigInt(args.lamports);

      if (lamports > limits.maxLamports) {
        return {
          effect: "deny",
          reason: `${String(lamports)} lamports exceeds cap of ${String(limits.maxLamports)} lamports`,
        };
      }

      if (!allowedSet.has(args.to)) {
        return {
          effect: "deny",
          reason: `destination ${args.to} is not on the allowlist`,
        };
      }

      return {
        effect: "approve",
        reason: `send ${String(lamports)} lamports to ${args.to} (within policy)`,
      };
    },
  ];
}
