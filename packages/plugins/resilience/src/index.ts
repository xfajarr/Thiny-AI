import type { z } from "zod";
import type { ToolMiddleware, Agent, Plugin } from "@thiny/core";

// ── retry ─────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Number of retry attempts after the first failure (total = retries + 1). */
  retries: number;
  /**
   * Base delay in milliseconds between attempts.
   * Actual delay = `baseDelayMs * 2^attempt` (exponential backoff).
   * Set to 0 for instant retries in tests.
   */
  baseDelayMs: number;
}

/**
 * Retry a failing tool call with exponential backoff.
 *
 * **Use only on idempotent tools.** Retrying a non-idempotent tool (e.g. a
 * transaction broadcast) can cause duplicate side effects.
 */
export function retry(opts: RetryOptions): ToolMiddleware {
  return async (call, next) => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      try {
        return await next(call);
      } catch (err) {
        lastError = err;
        if (attempt < opts.retries) {
          await new Promise((r) => setTimeout(r, opts.baseDelayMs * 2 ** attempt));
        }
      }
    }
    throw lastError;
  };
}

// ── timeout ───────────────────────────────────────────────────────────────────

/**
 * Fail a tool call that exceeds the given time limit.
 *
 * @param ms - Maximum milliseconds to wait for the tool to complete.
 */
export function timeout(ms: number): ToolMiddleware {
  return (call, next) =>
    Promise.race([
      next(call),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error(`timeout: "${call.tool.name}" did not complete within ${String(ms)}ms`));
        }, ms),
      ),
    ]);
}

// ── rateLimit ─────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Maximum number of calls per 60-second rolling window. */
  perMinute: number;
}

/**
 * Throttle tool calls to a maximum per-minute rate.
 *
 * One `rateLimit` instance tracks one agent run.
 * Create a fresh instance per run when used in middleware.
 */
export function rateLimit(opts: RateLimitOptions): ToolMiddleware {
  const hits: number[] = [];
  return async (call, next) => {
    const now = Date.now();
    while (hits.length > 0 && now - (hits[0] ?? now) > 60_000) hits.shift();
    if (hits.length >= opts.perMinute) {
      throw new Error(
        `rate limit: "${call.tool.name}" exceeded ${String(opts.perMinute)} calls/min`,
      );
    }
    hits.push(now);
    return next(call);
  };
}

// ── toolCache ─────────────────────────────────────────────────────────────────

/**
 * Memoize tool results by `toolName + JSON(args)`.
 *
 * Best for pure/read-only tools (balances, prices, contract reads).
 * Never use on tools with side effects.
 */
export function toolCache(): ToolMiddleware {
  const cache = new Map<string, unknown>();
  return async (call, next) => {
    const key = `${call.tool.name}:${JSON.stringify(call.args)}`;
    if (cache.has(key)) return cache.get(key);
    const result = await next(call);
    cache.set(key, result);
    return result;
  };
}

// ── idempotency ───────────────────────────────────────────────────────────────

/**
 * Dedup side-effecting calls by an `idempotencyKey` field in args.
 *
 * When two calls share the same `idempotencyKey`, the second call returns
 * the result of the first without re-executing the tool.
 */
export function idempotency(): ToolMiddleware {
  const seen = new Map<string, unknown>();
  return async (call, next) => {
    const args = call.args as { idempotencyKey?: string };
    const key = args.idempotencyKey;
    if (key && seen.has(key)) return seen.get(key);
    const result = await next(call);
    if (key) seen.set(key, result);
    return result;
  };
}

// ── runStructured ─────────────────────────────────────────────────────────────

/**
 * Run the agent and parse its final answer as Zod-validated JSON.
 *
 * Instructs the model to respond with only a JSON object, then validates
 * the response against the provided schema.
 *
 * @example
 * ```ts
 * import { runStructured } from "@thiny/plugin-resilience";
 *
 * const result = await runStructured(agent, "Rate this code quality", z.object({
 *   score: z.number().min(0).max(10),
 *   reason: z.string(),
 * }));
 * console.log(result.score); // typed as number
 * ```
 */
export async function runStructured<T>(
  agent: Agent,
  input: string,
  schema: z.ZodType<T>,
  opts?: { sessionId?: string },
): Promise<T> {
  const text = await agent.run(
    `${input}\n\nRespond with ONLY a valid JSON object matching this structure, no prose, no code fences.`,
    opts,
  );
  const match = /\{[\s\S]*\}/u.exec(text);
  if (!match)
    throw new Error(`runStructured: no JSON object found in response: "${text.slice(0, 100)}"`);
  return schema.parse(JSON.parse(match[0]));
}

export default function (_env: Record<string, string | undefined> = process.env): Plugin {
  return {
    name: "resilience",
    toolMiddleware: [retry({ retries: 2, baseDelayMs: 500 }), timeout(30_000), toolCache()],
  };
}
