import type { z } from "zod";
import type { Ctx } from "./context.js";

/**
 * A callable capability contributed by a plugin.
 *
 * Tools are the primary extension point of the Thiny kernel.
 * The `parameters` field serves dual purpose:
 *   1. **Runtime validation** — the kernel Zod-parses LLM args through it
 *      before `execute` is called, rejecting malformed input at the boundary.
 *   2. **JSON schema generation** — the schema is sent to the model so it
 *      knows how to call the tool correctly.
 *
 * **Error handling:** `execute` should throw on failure with a clear,
 * actionable message. The loop catches the error and feeds it back to
 * the model as an observation — the model can then recover or apologise.
 * Never return an error object; always throw.
 *
 * **Return values:** must be JSON-serialisable. Stringify BigInts
 * (`value.toString()`), convert Dates to ISO strings, and avoid class instances.
 *
 * @template A - The validated argument type, inferred from `parameters`.
 */
export interface Tool<A = unknown> {
  /** Unique name in `snake_case`, namespaced by domain (e.g. `evm_get_balance`). */
  name: string;
  /**
   * Natural-language description the model reads to decide when and how to call.
   * Write it for the model, not for humans. Include: what it does, when to use it,
   * and the shape of the result.
   */
  description: string;
  /**
   * Zod schema for the tool's input arguments.
   * Applied at the validation boundary before `execute` receives any data.
   */
  parameters: z.ZodType<A>;
  /**
   * When `true`, the policy engine defaults to requiring explicit approval
   * before this tool can execute.
   * Set on any tool that moves value, writes to external systems, or is destructive.
   */
  sensitive?: boolean;
  /** Optional tags for filtering, policy rules, and observability. */
  tags?: string[];
  /**
   * Execute the tool with validated arguments.
   *
   * @param args - Already validated by `parameters.parse()`. The type matches `A`.
   * @param ctx  - The agent's shared context. Use `ctx.logger`, `ctx.state`,
   *               `ctx.signer`, and `ctx.spawn` as needed.
   * @returns A JSON-serialisable result. Throw on failure — never return error objects.
   */
  execute(args: A, ctx: Ctx): Promise<unknown>;
}

/**
 * Type-safe helper for defining tools.
 *
 * Preserves the argument type `A` through TypeScript inference, ensuring the
 * `execute` callback is correctly typed without extra annotations.
 *
 * @example
 * ```ts
 * const greetTool = defineTool({
 *   name: "greet",
 *   description: "Greet a person by name.",
 *   parameters: z.object({ name: z.string() }),
 *   execute: async ({ name }) => `Hello, ${name}!`,
 * });
 * ```
 */
export function defineTool<A>(tool: Tool<A>): Tool<A> {
  return tool;
}
