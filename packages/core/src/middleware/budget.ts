import type { ModelMiddleware } from "../middleware.js";
import { BudgetError } from "../errors.js";

/** Configuration for the token/call budget circuit breaker. */
export interface BudgetOptions {
  /**
   * Hard cap on the total number of input + output tokens across all model
   * calls in a single agent run.
   * Must be a positive integer.
   */
  maxTokens?: number;
  /**
   * Hard cap on the total number of model calls in a single agent run.
   * Must be a positive integer.
   */
  maxCalls?: number;
}

/**
 * Circuit-breaker middleware that terminates a run when a budget limit is exceeded.
 *
 * **Scope:** one `budgetMiddleware` instance tracks one agent run.
 * Create a fresh instance per run — do NOT share a single instance across runs,
 * or the counters will accumulate across calls.
 *
 * **Failure mode:** throws `BudgetError` which is NOT fed back to the model as
 * an observation — the run is terminated immediately to prevent runaway costs.
 *
 * @throws {Error} When an option is provided but is not a positive integer.
 *
 * @example
 * ```ts
 * plugins: [{
 *   name: "safety",
 *   modelMiddleware: [budgetMiddleware({ maxCalls: 20, maxTokens: 100_000 })],
 * }]
 * ```
 */
export function budgetMiddleware(opts: BudgetOptions): ModelMiddleware {
  if (opts.maxTokens !== undefined && (opts.maxTokens <= 0 || !Number.isInteger(opts.maxTokens))) {
    throw new Error(
      `budgetMiddleware: maxTokens must be a positive integer, got ${String(opts.maxTokens)}`,
    );
  }
  if (opts.maxCalls !== undefined && (opts.maxCalls <= 0 || !Number.isInteger(opts.maxCalls))) {
    throw new Error(
      `budgetMiddleware: maxCalls must be a positive integer, got ${String(opts.maxCalls)}`,
    );
  }

  let totalTokens = 0;
  let totalCalls = 0;

  return async (req, next) => {
    if (opts.maxCalls !== undefined && totalCalls >= opts.maxCalls) {
      throw new BudgetError(
        `Budget exceeded: ${String(totalCalls)} model calls reached the limit of ${String(opts.maxCalls)}.`,
      );
    }
    totalCalls++;

    const response = await next(req);

    totalTokens += (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0);
    if (opts.maxTokens !== undefined && totalTokens > opts.maxTokens) {
      throw new BudgetError(
        `Budget exceeded: ${String(totalTokens)} tokens used, limit is ${String(opts.maxTokens)}.`,
      );
    }

    return response;
  };
}
