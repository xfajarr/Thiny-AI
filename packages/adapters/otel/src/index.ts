import { trace, context, type Tracer, type Span, SpanStatusCode } from "@opentelemetry/api";
import type { Plugin, Ctx, Message, ModelResponse } from "@thiny/core";

export interface OtelTracingOptions {
  tracerName?: string;
}

interface StartPayload {
  sessionId: string;
}

interface ModelCallPayload {
  step: number;
  messages: Message[];
}

interface ToolCallPayload {
  call: {
    id: string;
    name: string;
    args: unknown;
  };
}

interface AfterToolCallPayload {
  call: {
    id: string;
    name: string;
    args: unknown;
  };
  content: string;
}

interface ErrorPayload {
  call: {
    id: string;
    name: string;
    args: unknown;
  };
  error: string;
}

interface FinishPayload {
  step: number;
  text: string;
}

export function otelTracingPlugin(opts: OtelTracingOptions = {}): Plugin {
  const tracer: Tracer = trace.getTracer(opts.tracerName ?? "thiny");

  const activeSpans = new Map<string, Span>();
  let runSpan: Span | undefined;

  return {
    name: "otel-tracing",
    setup(ctx: Ctx): Promise<void> {
      ctx.events.on("onStart", (payload: unknown) => {
        const start = payload as StartPayload;
        runSpan = tracer.startSpan("agent_run", {
          attributes: { "thiny.session_id": start.sessionId },
        });
      });

      ctx.events.on("beforeModelCall", (payload: unknown) => {
        const p = payload as ModelCallPayload;
        const parentContext = runSpan ? trace.setSpan(context.active(), runSpan) : context.active();
        context.with(parentContext, () => {
          const span = tracer.startSpan(`model_call:step_${String(p.step)}`);
          activeSpans.set(`model:${String(p.step)}`, span);
        });
      });

      ctx.events.on("afterModelCall", (payload: unknown) => {
        const p = payload as { step: number; response: ModelResponse };
        const key = `model:${String(p.step)}`;
        const span = activeSpans.get(key);
        if (span) {
          span.end();
          activeSpans.delete(key);
        }
      });

      ctx.events.on("beforeToolCall", (payload: unknown) => {
        const p = payload as ToolCallPayload;
        const parentContext = runSpan ? trace.setSpan(context.active(), runSpan) : context.active();
        context.with(parentContext, () => {
          const span = tracer.startSpan(`tool_call:${p.call.name}`, {
            attributes: {
              "thiny.tool.name": p.call.name,
              "thiny.tool.id": p.call.id,
              "thiny.tool.args": JSON.stringify(p.call.args),
            },
          });
          activeSpans.set(`tool:${p.call.id}`, span);
        });
      });

      ctx.events.on("afterToolCall", (payload: unknown) => {
        const p = payload as AfterToolCallPayload;
        const key = `tool:${p.call.id}`;
        const span = activeSpans.get(key);
        if (span) {
          span.setAttribute("thiny.tool.result", p.content);
          span.end();
          activeSpans.delete(key);
        }
      });

      ctx.events.on("onError", (payload: unknown) => {
        const p = payload as ErrorPayload;
        const key = `tool:${p.call.id}`;
        const span = activeSpans.get(key);
        if (span) {
          span.recordException(new Error(p.error));
          span.setStatus({ code: SpanStatusCode.ERROR, message: p.error });
        }
      });

      ctx.events.on("onFinish", (payload: unknown) => {
        const p = payload as FinishPayload;
        if (runSpan) {
          runSpan.setAttribute("thiny.result.text", p.text);
          runSpan.end();
          runSpan = undefined;
        }
      });

      return Promise.resolve();
    },
  };
}

export default function (env: Record<string, string | undefined> = process.env): Plugin {
  return otelTracingPlugin({
    tracerName: env.OTEL_TRACER_NAME ?? "thiny",
  });
}
