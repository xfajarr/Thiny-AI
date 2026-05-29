import type { ModelMiddleware, ToolMiddleware } from "../middleware.js";
import type { Logger } from "../ports.js";

/**
 * Logs every model call with latency, finish reason, tool names called, and
 * token usage. Runs around the full middleware chain, so it includes time
 * spent in nested middleware (e.g. budget checks).
 */
export function modelAuditMiddleware(logger: Logger): ModelMiddleware {
  return async (req, next) => {
    const startedAt = Date.now();
    const response = await next(req);
    logger.info(
      {
        kind: "model_call",
        durationMs: Date.now() - startedAt,
        finishReason: response.finishReason,
        toolCalls: response.toolCalls?.map((c) => c.name) ?? [],
        usage: response.usage,
      },
      "model_call",
    );
    return response;
  };
}

/**
 * Logs every tool call with name, latency, and success/failure.
 * On failure, logs the full error message and stack trace to aid debugging.
 * Re-throws the error after logging so the loop's error-as-observation
 * mechanism continues to work normally.
 */
export function toolAuditMiddleware(logger: Logger): ToolMiddleware {
  return async (call, next) => {
    const startedAt = Date.now();
    try {
      const result = await next(call);
      logger.info(
        {
          kind: "tool_call",
          tool: call.tool.name,
          durationMs: Date.now() - startedAt,
          ok: true,
        },
        "tool_call",
      );
      return result;
    } catch (err) {
      logger.error(
        {
          kind: "tool_call",
          tool: call.tool.name,
          durationMs: Date.now() - startedAt,
          ok: false,
          // Include message and stack separately so structured log consumers
          // can filter on message while retaining the full stack for debugging.
          errorMessage: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? err.stack : undefined,
          errorName: err instanceof Error ? err.name : undefined,
        },
        "tool_call_failed",
      );
      throw err;
    }
  };
}
