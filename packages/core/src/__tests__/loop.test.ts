import { describe, it, expect } from "vitest";
import { z } from "zod";
import { runLoop } from "../loop.js";
import { ToolRegistry } from "../registry.js";
import { EventBus } from "../events.js";
import { defineTool } from "../tool.js";
import type { Ctx } from "../context.js";
import type { ModelProvider } from "../ports.js";
import type { Message, ModelResponse } from "../domain/messages.js";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};
const silent = {
  info: noop,
  warn: noop,
  error: noop,
  child() {
    return silent;
  },
};

function makeCtx(model: ModelProvider, tools = new ToolRegistry()): Ctx {
  return {
    sessionId: "test",
    model,
    memory: {
      load: () => Promise.resolve([]),
      append: () => Promise.resolve(),
    },
    tools,
    events: new EventBus(),
    logger: silent,
    state: new Map(),
    maxSteps: 5,
  };
}

describe("runLoop", () => {
  it("returns model text when no tools are requested", async () => {
    const model: ModelProvider = {
      generate: (): Promise<ModelResponse> =>
        Promise.resolve({ text: "hello", finishReason: "stop" }),
    };
    expect(await runLoop("hi", makeCtx(model))).toBe("hello");
  });

  it("executes a tool then loops back for the final answer", async () => {
    const tools = new ToolRegistry();
    tools.register(
      defineTool({
        name: "echo",
        description: "echo",
        parameters: z.object({ text: z.string() }),
        execute: ({ text }) => Promise.resolve(`echoed:${text}`),
      }),
    );

    let step = 0;
    const model: ModelProvider = {
      generate: (messages: Message[]): Promise<ModelResponse> => {
        step++;
        if (step === 1) {
          return Promise.resolve({
            finishReason: "tool_calls",
            toolCalls: [{ id: "c1", name: "echo", args: { text: "yo" } }],
          });
        }
        const toolMsg = messages.find((m) => m.role === "tool") as { content: string };
        return Promise.resolve({ text: `done: ${toolMsg.content}`, finishReason: "stop" });
      },
    };
    expect(await runLoop("echo yo", makeCtx(model, tools))).toBe('done: "echoed:yo"');
  });

  it("feeds tool errors back as observations (error-as-observation)", async () => {
    const tools = new ToolRegistry();
    tools.register(
      defineTool({
        name: "boom",
        description: "always fails",
        parameters: z.object({}),
        execute: (): Promise<never> => {
          throw new Error("kaboom");
        },
      }),
    );

    let step = 0;
    const model: ModelProvider = {
      generate: (messages: Message[]): Promise<ModelResponse> => {
        step++;
        if (step === 1)
          return Promise.resolve({
            finishReason: "tool_calls",
            toolCalls: [{ id: "c1", name: "boom", args: {} }],
          });
        const toolMsg = messages.find((m) => m.role === "tool") as { content: string };
        return Promise.resolve({ text: toolMsg.content, finishReason: "stop" });
      },
    };
    expect(await runLoop("go", makeCtx(model, tools))).toMatch(/ERROR: kaboom/);
  });

  it("throws MaxStepsError when the model loops forever", async () => {
    const tools = new ToolRegistry();
    tools.register(
      defineTool({
        name: "noop",
        description: "",
        parameters: z.object({}),
        execute: () => Promise.resolve("x"),
      }),
    );
    const model: ModelProvider = {
      generate: (): Promise<ModelResponse> =>
        Promise.resolve({
          finishReason: "tool_calls",
          toolCalls: [{ id: "c", name: "noop", args: {} }],
        }),
    };
    await expect(runLoop("loop", makeCtx(model, tools))).rejects.toThrow(/max steps/);
  });
});
