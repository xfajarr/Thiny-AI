import type { Approver } from "./ports.js";

/**
 * Headless approver that denies every sensitive tool call.
 *
 * This is the safe default for autonomous / unattended agents.
 * When no human is present to review a sensitive operation, denying by default
 * prevents unintended side effects.
 *
 * To allow specific tools in headless mode, use `autoApprover` with an
 * explicit allowlist instead.
 */
export const denyApprover: Approver = () => Promise.resolve(false);

/**
 * Headless approver that approves only the explicitly listed tool names.
 *
 * **Security note:** pair this with a `policyMiddleware` that enforces value caps
 * and destination allowlists. The approver is the *final* gate, not the *only* one.
 *
 * @param allowedToolNames - Exact tool names to allow. Any tool not on this list
 *   is denied without further evaluation. The comparison is case-sensitive.
 *
 * @example
 * ```ts
 * // In a daemon head — only allow safe read tools automatically
 * const approver = autoApprover(["evm_get_balance", "market_price"]);
 * ```
 */
export function autoApprover(allowedToolNames: readonly string[]): Approver {
  const allowedSet = new Set(allowedToolNames);
  return (req) => Promise.resolve(allowedSet.has(req.tool));
}
