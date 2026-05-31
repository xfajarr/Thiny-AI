import { describe, it, expect, vi } from "vitest";
import { otelTracingPlugin } from "../index.js";
import { EventBus } from "@thiny/core";
import { trace } from "@opentelemetry/api";

describe("otelTracingPlugin", () => {
  it("subscribes to EventBus events and initiates spans", async () => {
    const mockSpan = {
      end: vi.fn(),
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      setStatus: vi.fn(),
    };
    const mockTracer = {
      startSpan: vi.fn().mockReturnValue(mockSpan),
    };
    const getTracerSpy = vi.spyOn(trace, "getTracer").mockReturnValue(mockTracer as any);

    const plugin = otelTracingPlugin({ tracerName: "test-tracer" });
    const events = new EventBus();
    const mockCtx = {
      events,
    };

    if (plugin.setup) {
      await plugin.setup(mockCtx as any);
    }

    events.emit("onStart", { sessionId: "session_1" });
    expect(mockTracer.startSpan).toHaveBeenCalledWith("agent_run", expect.any(Object));

    events.emit("beforeModelCall", { step: 0 });
    expect(mockTracer.startSpan).toHaveBeenCalledWith("model_call:step_0");

    events.emit("afterModelCall", { step: 0 });
    expect(mockSpan.end).toHaveBeenCalled();

    getTracerSpy.mockRestore();
  });
});
