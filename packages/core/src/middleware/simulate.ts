import type { ToolMiddleware, ToolCallCtx } from "../middleware.js";

/** The result of simulating a tool call before broadcasting. */
export interface SimulateResult {
  /** Whether the simulation predicts the call will succeed. */
  success: boolean;
  /** Human-readable reason when `success` is false. */
  reason?: string;
}

/**
 * A function that simulates what would happen if a tool call were executed.
 * Returns `{ success: false, reason }` when the call is predicted to fail
 * (e.g. transaction would revert, insufficient balance, invalid args).
 */
export type Simulator = (call: ToolCallCtx) => Promise<SimulateResult>;

/**
 * Middleware that runs a simulation before any sensitive tool call is executed.
 *
 * **Why this matters for DeFi:** a transaction that will revert on-chain is
 * still submitted and costs gas. `simulateMiddleware` catches the revert before
 * broadcast — no gas wasted, no failed transaction in the model's observations.
 *
 * **When the simulation fails:** throws an `Error` with the reason, which the
 * loop converts into a model observation. The model can then correct its
 * arguments and retry. No actual execution occurs.
 *
 * **Non-sensitive tools** are passed through without simulation.
 *
 * @example
 * ```ts
 * import { simulateMiddleware } from "@thiny/core";
 *
 * // Viem-based simulator for EVM transactions
 * const simulator: Simulator = async (call) => {
 *   const args = call.args as { to: string; valueWei: string };
 *   try {
 *     await publicClient.call({ to: args.to as `0x${string}`, value: BigInt(args.valueWei) });
 *     return { success: true };
 *   } catch (err) {
 *     return { success: false, reason: err instanceof Error ? err.message : String(err) };
 *   }
 * };
 *
 * plugins: [{ name: "safety", toolMiddleware: [simulateMiddleware(simulator)] }]
 * ```
 */
export function simulateMiddleware(simulator: Simulator): ToolMiddleware {
  return async (call, next) => {
    if (!call.tool.sensitive) return next(call);

    const result = await simulator(call);

    if (!result.success) {
      throw new Error(
        `Simulation failed for "${call.tool.name}": ${result.reason ?? "unknown reason"}. ` +
          `The call was not executed. Adjust the arguments and try again.`,
      );
    }

    return next(call);
  };
}
