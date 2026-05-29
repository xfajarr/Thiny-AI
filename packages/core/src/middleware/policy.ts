import type { ToolMiddleware, ToolCallCtx } from "../middleware.js";
import { PolicyError } from "../errors.js";

export interface PolicyDecision {
  effect: "allow" | "deny" | "approve";
  reason: string;
}

/**
 * A deterministic rule. Return null to abstain (let later rules / defaults decide).
 * NEVER read model text or tool output — decisions must be computed from
 * the tool definition + parsed args only. That is the prompt-injection boundary.
 */
export type PolicyRule = (call: ToolCallCtx) => PolicyDecision | null;

/**
 * Deterministic gate over tool execution.
 * The LLM proposes; this middleware enforces.
 */
export function policyMiddleware(rules: PolicyRule[]): ToolMiddleware {
  return async (call, next) => {
    let decision: PolicyDecision = {
      effect: call.tool.sensitive ? "approve" : "allow",
      reason: "default",
    };

    for (const rule of rules) {
      const d = rule(call);
      if (d) {
        decision = d;
        break;
      }
    }

    if (decision.effect === "deny") {
      throw new PolicyError(`policy denied: ${decision.reason}`);
    }

    if (decision.effect === "approve") {
      const approved = call.ctx.approver
        ? await call.ctx.approver({
            tool: call.tool.name,
            args: call.args,
            reason: decision.reason,
          })
        : false;
      if (!approved) {
        throw new PolicyError(`approval required and not granted: ${call.tool.name}`);
      }
    }

    return next(call);
  };
}
