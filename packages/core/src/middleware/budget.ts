import type { ModelMiddleware } from "../middleware.js";
import type { Logger } from "../ports.js";
import { BudgetError } from "../errors.js";

/** Configuration for the token/call budget circuit breaker. */
export interface BudgetOptions {
  /**
   * Hard cap on the total number of input + output tokens across all model
   * calls in a single agent run. Must be a positive integer.
   *
   * **Note on enforcement:** token usage is only known after a call completes.
   * The check runs at the start of each call using the accumulated total from
   * all *previous* calls. The call that first tips over the limit executes;
   * subsequent calls are blocked. This is the tightest enforcement possible
   * without token-count estimation.
   */
  maxTokens?: number;
  /**
   * Hard cap on the total number of model calls in a single agent run.
   * Must be a positive integer. Checked before each call.
   */
  maxCalls?: number;
  /**
   * Logger for budget warnings and status. When provided, a warning is emitted
   * when accumulated usage reaches `warnAtFraction` of the configured limit.
   */
  logger?: Logger;
  /**
   * Fraction of the budget at which to emit a warning log (0–1).
   * Default: `0.8` (warn at 80% of budget).
   */
  warnAtFraction?: number;
}

/**
 * Circuit-breaker middleware that terminates a run when a budget limit is exceeded.
 *
 * **Scope:** one `budgetMiddleware` instance tracks one agent run.
 * Create a fresh instance per run — do NOT share a single instance across runs
 * or the counters will accumulate.
 *
 * **Failure mode:** throws `BudgetError` which is NOT fed back to the model as
 * an observation — the run is terminated immediately to prevent runaway costs.
 *
 * @throws {Error} When an option is provided but not a positive integer.
 *
 * @example
 * ```ts
 * plugins: [{
 *   name: "safety",
 *   modelMiddleware: [
 *     budgetMiddleware({ maxCalls: 20, maxTokens: 100_000, logger }),
 *   ],
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

  const warnAt = opts.warnAtFraction ?? 0.8;
  let totalTokens = 0;
  let totalCalls = 0;
  let tokenWarnEmitted = false;
  let callWarnEmitted = false;

  return async (req, next) => {
    // Pre-call checks — block before making the call.
    if (opts.maxCalls !== undefined && totalCalls >= opts.maxCalls) {
      throw new BudgetError(
        `Budget exceeded: ${String(totalCalls)} model calls reached the limit of ${String(opts.maxCalls)}.`,
      );
    }
    if (opts.maxTokens !== undefined && totalTokens > opts.maxTokens) {
      throw new BudgetError(
        `Budget exceeded: ${String(totalTokens)} tokens used from previous calls, limit is ${String(opts.maxTokens)}.`,
      );
    }

    // Warn when approaching limits (emitted once per run, not on every call).
    if (opts.logger) {
      if (opts.maxCalls !== undefined && !callWarnEmitted && totalCalls / opts.maxCalls >= warnAt) {
        opts.logger.warn(
          {
            event: "budget_warning",
            kind: "calls",
            used: totalCalls,
            limit: opts.maxCalls,
            pct: Math.round((totalCalls / opts.maxCalls) * 100),
          },
          `Budget warning: ${String(totalCalls)}/${String(opts.maxCalls)} model calls used`,
        );
        callWarnEmitted = true;
      }
      if (
        opts.maxTokens !== undefined &&
        !tokenWarnEmitted &&
        totalTokens / opts.maxTokens >= warnAt
      ) {
        opts.logger.warn(
          {
            event: "budget_warning",
            kind: "tokens",
            used: totalTokens,
            limit: opts.maxTokens,
            pct: Math.round((totalTokens / opts.maxTokens) * 100),
          },
          `Budget warning: ${String(totalTokens)}/${String(opts.maxTokens)} tokens used`,
        );
        tokenWarnEmitted = true;
      }
    }

    totalCalls++;
    const response = await next(req);

    // Post-call: accumulate usage for future checks.
    // The call that first tips over the token limit is allowed to complete;
    // the following call will be blocked by the pre-call check above.
    totalTokens += (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0);

    return response;
  };
}
