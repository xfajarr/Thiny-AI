import type { Approver } from "./ports.js";

/** Safe default for headless/autonomous mode — never approve a sensitive tool. */
export const denyApprover: Approver = () => Promise.resolve(false);

/**
 * Approve only tools whose names are explicitly allowlisted.
 * Pair with a policy engine that caps value and allowlists destinations.
 */
export function autoApprover(allowTools: string[]): Approver {
  const allow = new Set(allowTools);
  return (req) => Promise.resolve(allow.has(req.tool));
}
