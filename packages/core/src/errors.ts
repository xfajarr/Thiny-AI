export class MaxStepsError extends Error {
  constructor(public steps: number) {
    super(`max steps exceeded: ${String(steps)}`);
    this.name = "MaxStepsError";
  }
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetError";
  }
}
