import type { ToolMiddleware, ToolCallCtx } from "../middleware.js";
import { PolicyError } from "../errors.js";

/** The outcome of a policy rule evaluation. */
export interface PolicyDecision {
  /** `allow`: proceed. `deny`: block with error. `approve`: require explicit approval. */
  effect: "allow" | "deny" | "approve";
  /** Human-readable reason, included in error messages and approval prompts. */
  reason: string;
}

/**
 * A single deterministic policy rule.
 *
 * Rules are evaluated in order until one returns a non-null decision.
 * Return `null` to abstain and let the next rule (or the default) decide.
 *
 * **Security contract:** decisions MUST be computed only from `call.tool`
 * definitions and `call.args` (Zod-validated before rules run).
 * Never read model-generated text or `ctx.state` — that is the
 * prompt-injection boundary.
 *
 * @returns A `PolicyDecision` to end evaluation, or `null` to abstain.
 */
export type PolicyRule = (
  call: Omit<ToolCallCtx, "args"> & { args: unknown },
) => PolicyDecision | null;

/**
 * Deterministic gate over tool execution.
 *
 * The LLM is an untrusted planner — it proposes tool calls; this middleware
 * enforces rules that cannot be bypassed through prompt manipulation.
 *
 * **Validation:** tool args are Zod-parsed at the boundary before any rule
 * sees them. Policy rules always receive validated, type-safe data — never raw
 * LLM JSON. The validated args are also passed downstream to the base handler.
 *
 * **Default behaviour (no matching rule):**
 * - Non-sensitive tools → `allow`
 * - Sensitive tools (`tool.sensitive === true`) → `approve` — requires the
 *   `ctx.approver` to return `true`, otherwise throws `PolicyError`.
 *
 * **Rule evaluation:** rules run in array order; first non-null decision wins.
 *
 * **Logging:** every allow, deny, and approve decision is logged to `ctx.logger`
 * at `info` (allow) or `warn` (deny/approve-denied) level for audit purposes.
 *
 * @param rules - Ordered array of deterministic policy rules.
 */
export function policyMiddleware(rules: PolicyRule[]): ToolMiddleware {
  return async (call, next) => {
    // Parse args at the boundary so rules never touch raw untrusted LLM JSON.
    // Include the actual Zod error so callers can see what was invalid.
    let validatedArgs: unknown;
    try {
      validatedArgs = call.tool.parameters.parse(call.args);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      call.ctx.logger.warn(
        { event: "policy_validation_failed", tool: call.tool.name, detail },
        `Tool "${call.tool.name}" received invalid arguments`,
      );
      throw new PolicyError(`Invalid arguments for tool "${call.tool.name}": ${detail}`, {
        cause: err,
      });
    }

    const validatedCall = { ...call, args: validatedArgs };
    const decision = evaluateRules(rules, validatedCall);

    if (decision.effect === "allow") {
      call.ctx.logger.info(
        { event: "policy_allow", tool: call.tool.name, reason: decision.reason },
        `Policy allowed "${call.tool.name}"`,
      );
      return next({ ...call, args: validatedArgs });
    }

    if (decision.effect === "deny") {
      call.ctx.logger.warn(
        { event: "policy_deny", tool: call.tool.name, reason: decision.reason },
        `Policy denied "${call.tool.name}": ${decision.reason}`,
      );
      throw new PolicyError(`Policy denied "${call.tool.name}": ${decision.reason}`);
    }

    // effect === "approve"
    call.ctx.logger.info(
      { event: "policy_approval_requested", tool: call.tool.name, reason: decision.reason },
      `Approval requested for "${call.tool.name}"`,
    );

    // SECURITY: `decision.reason` is displayed to the human approver (e.g. in CLI).
    // Policy rules MUST produce static, data-derived reason strings only —
    // never embed model-generated text, as that would open a social-engineering
    // vector where a model crafts tool args to manipulate the approver.
    const approved = call.ctx.approver
      ? await call.ctx.approver({
          tool: call.tool.name,
          args: validatedArgs,
          reason: decision.reason,
        })
      : false;

    if (!approved) {
      call.ctx.logger.warn(
        { event: "policy_approval_denied", tool: call.tool.name, reason: decision.reason },
        `Approval denied for "${call.tool.name}"`,
      );
      throw new PolicyError(
        `Approval required for "${call.tool.name}" but was not granted. Reason: ${decision.reason}`,
      );
    }

    call.ctx.logger.info(
      { event: "policy_approved", tool: call.tool.name, reason: decision.reason },
      `Approval granted for "${call.tool.name}"`,
    );
    return next({ ...call, args: validatedArgs });
  };
}

/** Evaluate rules in order, returning the first matching decision or the default. */
function evaluateRules(
  rules: PolicyRule[],
  call: Omit<ToolCallCtx, "args"> & { args: unknown },
): PolicyDecision {
  for (const rule of rules) {
    const decision = rule(call);
    if (decision !== null) return decision;
  }
  return {
    effect: call.tool.sensitive === true ? "approve" : "allow",
    reason: "default policy",
  };
}
