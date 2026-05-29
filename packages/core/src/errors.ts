/**
 * Thrown by `runLoop` when the model has not stopped after `maxSteps`
 * consecutive steps without producing a final text response.
 *
 * This is the primary circuit breaker against infinite tool-calling loops.
 * Increase `AgentConfig.maxSteps` if legitimate workflows need more steps.
 */
export class MaxStepsError extends Error {
  constructor(public readonly steps: number) {
    super(
      `Agent exceeded the maximum of ${String(steps)} steps without producing a final answer. ` +
        `Increase maxSteps if your workflow needs more, or check for a tool-calling loop.`,
    );
    this.name = "MaxStepsError";
  }
}

/**
 * Thrown by `policyMiddleware` when a `PolicyRule` returns `{ effect: "deny" }`,
 * or when a sensitive tool's approval was not granted.
 *
 * This error is fed back to the model as an observation so it can
 * acknowledge the denial and adjust its behaviour.
 */
export class PolicyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PolicyError";
  }
}

/**
 * Thrown by `budgetMiddleware` when the token or call-count budget is exhausted.
 *
 * Treated as a hard stop — the run is terminated with this error rather than
 * feeding it back to the model as an observation.
 */
export class BudgetError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BudgetError";
  }
}
