import type { ModelMiddleware, ToolMiddleware } from "../middleware.js";
import type { Logger } from "../ports.js";

/** Logs every model call: latency, finish reason, token usage. */
export function modelAudit(logger: Logger): ModelMiddleware {
  return async (req, next) => {
    const t0 = Date.now();
    const res = await next(req);
    logger.info(
      {
        kind: "model_call",
        ms: Date.now() - t0,
        finishReason: res.finishReason,
        toolCalls: res.toolCalls?.map((c) => c.name) ?? [],
        usage: res.usage,
      },
      "model_call",
    );
    return res;
  };
}

/** Logs every tool call: name, latency, ok/error. */
export function toolAudit(logger: Logger): ToolMiddleware {
  return async (call, next) => {
    const t0 = Date.now();
    try {
      const result = await next(call);
      logger.info(
        { kind: "tool_call", tool: call.tool.name, ms: Date.now() - t0, ok: true },
        "tool_call",
      );
      return result;
    } catch (err) {
      logger.error(
        {
          kind: "tool_call",
          tool: call.tool.name,
          ms: Date.now() - t0,
          ok: false,
          error: String(err),
        },
        "tool_call_failed",
      );
      throw err;
    }
  };
}
