import type { Message, ModelResponse } from "./domain/messages.js";
import type { Tool } from "./tool.js";
import type { Ctx } from "./context.js";

/**
 * The request passed into model middleware.
 * Contains everything the model needs to generate a response.
 */
export interface ModelRequest {
  /** Full conversation history including the current user turn. */
  messages: Message[];
  /** Tools the model may call this step. */
  tools: Tool[];
}

/**
 * Calls the next handler in the model middleware chain.
 * Receives the (potentially modified) request and returns the model response.
 */
export type ModelNext = (req: ModelRequest) => Promise<ModelResponse>;

/**
 * A composable wrapper around a model call.
 *
 * Model middleware wraps `model.generate` (and the streaming equivalent).
 * Use it for concerns that belong to the LLM call layer:
 * token-budget enforcement, latency logging, response caching,
 * context compaction, prompt injection.
 *
 * **Composition order:** middleware is composed outside-in.
 * The first element in the array wraps all subsequent ones.
 *
 * @example
 * ```ts
 * const timing: ModelMiddleware = async (req, next) => {
 *   const start = Date.now();
 *   const res = await next(req);
 *   console.log(`model call took ${Date.now() - start}ms`);
 *   return res;
 * };
 * ```
 */
export type ModelMiddleware = (req: ModelRequest, next: ModelNext) => Promise<ModelResponse>;

/**
 * The full context for a single tool invocation, passed into tool middleware.
 */
export interface ToolCallCtx {
  /** The tool about to be executed. */
  tool: Tool;
  /** The validated arguments the tool will receive. */
  args: unknown;
  /** The agent's shared context for this run. */
  ctx: Ctx;
}

/**
 * Calls the next handler in the tool middleware chain.
 * Returns whatever the tool (or a middleware short-circuit) produces.
 */
export type ToolNext = (call: ToolCallCtx) => Promise<unknown>;

/**
 * A composable wrapper around tool execution.
 *
 * Tool middleware wraps every `tool.execute` call. Use it for:
 * authorization gates, approval prompts, audit logging,
 * rate limiting, idempotency, retry logic.
 *
 * **To deny a call:** throw before calling `next`.
 * The loop catches the error and feeds it back to the model as an observation.
 *
 * **Composition order:** middleware is composed outside-in.
 * The first element in the array wraps all subsequent ones.
 *
 * @example
 * ```ts
 * const rateLimiter: ToolMiddleware = async (call, next) => {
 *   if (isRateLimited(call.tool.name)) throw new Error("rate limit exceeded");
 *   return next(call);
 * };
 * ```
 */
export type ToolMiddleware = (call: ToolCallCtx, next: ToolNext) => Promise<unknown>;
