import type { ModelMiddleware } from "../middleware.js";
import { BudgetError } from "../errors.js";

export interface BudgetOptions {
  maxTokens?: number;
  maxCalls?: number;
}

/** Stateful per-construction — create one budget per agent run for isolation. */
export function budgetMiddleware(opts: BudgetOptions): ModelMiddleware {
  let tokens = 0;
  let calls  = 0;
  return async (req, next) => {
    if (opts.maxCalls !== undefined && calls >= opts.maxCalls) {
      throw new BudgetError(`budget exceeded: ${String(calls)} model calls`);
    }
    calls++;
    const res = await next(req);
    tokens += (res.usage?.inputTokens ?? 0) + (res.usage?.outputTokens ?? 0);
    if (opts.maxTokens !== undefined && tokens > opts.maxTokens) {
      throw new BudgetError(`budget exceeded: ${String(tokens)} tokens`);
    }
    return res;
  };
}
