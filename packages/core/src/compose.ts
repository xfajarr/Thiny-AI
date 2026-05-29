import type { ModelMiddleware, ModelNext, ToolMiddleware, ToolNext } from "./middleware.js";

/**
 * Compose an array of model middleware into a single `ModelNext` function.
 *
 * Middleware is applied **outside-in**: the first element in `middlewares`
 * is the outermost wrapper (called first on the way in, last on the way out).
 *
 * @param middlewares - Ordered array of model middleware to compose.
 * @param base        - The innermost handler (the actual model call).
 * @returns A single function that runs the full middleware chain then `base`.
 *
 * @example
 * ```ts
 * const generate = composeModel(
 *   [auditMiddleware, budgetMiddleware],
 *   (req) => model.generate(req.messages, req.tools),
 * );
 * ```
 */
export function composeModel(middlewares: ModelMiddleware[], base: ModelNext): ModelNext {
  return middlewares.reduceRight<ModelNext>((next, mw) => (req) => mw(req, next), base);
}

/**
 * Compose an array of tool middleware into a single `ToolNext` function.
 *
 * Middleware is applied **outside-in**: the first element in `middlewares`
 * is the outermost wrapper. To block execution, throw inside a middleware
 * before calling `next` — the loop converts the error into a model observation.
 *
 * @param middlewares - Ordered array of tool middleware to compose.
 * @param base        - The innermost handler (the actual tool execution).
 * @returns A single function that runs the full middleware chain then `base`.
 *
 * @example
 * ```ts
 * const runTool = composeTool(
 *   [auditMiddleware, policyMiddleware],
 *   ({ tool, args, ctx }) => tool.execute(args, ctx),
 * );
 * ```
 */
export function composeTool(middlewares: ToolMiddleware[], base: ToolNext): ToolNext {
  return middlewares.reduceRight<ToolNext>((next, mw) => (call) => mw(call, next), base);
}
