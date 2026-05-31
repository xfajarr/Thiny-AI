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
    const result = await runLoop("hi", makeCtx(model));
    expect(result.text).toBe("hello");
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
    const result = await runLoop("echo yo", makeCtx(model, tools));
    expect(result.text).toBe('done: "echoed:yo"');
  });

  it("returns the full transcript including tool messages", async () => {
    const tools = new ToolRegistry();
    tools.register(
      defineTool({
        name: "add",
        description: "add two numbers",
        parameters: z.object({ a: z.number(), b: z.number() }),
        execute: ({ a, b }) => Promise.resolve(a + b),
      }),
    );

    let step = 0;
    const model: ModelProvider = {
      generate: (_messages: Message[]): Promise<ModelResponse> => {
        step++;
        if (step === 1) {
          return Promise.resolve({
            finishReason: "tool_calls",
            toolCalls: [{ id: "c1", name: "add", args: { a: 3, b: 4 } }],
          });
        }
        return Promise.resolve({ text: "the sum is 7", finishReason: "stop" });
      },
    };
    const result = await runLoop("3+4", makeCtx(model, tools));
    expect(result.text).toBe("the sum is 7");

    // Full transcript should have: user, assistant(toolCalls), tool(result), assistant(final)
    const roles = result.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "tool", "assistant"]);

    // Tool message should contain the computed result
    const toolMsg = result.messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect((toolMsg as { content: string }).content).toBe("7");
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
    const result = await runLoop("go", makeCtx(model, tools));
    expect(result.text).toMatch(/ERROR: kaboom/);
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
    await expect(runLoop("loop", makeCtx(model, tools))).rejects.toThrow(/exceeded the maximum/);
  });

  it("serializes conflicting tool executions via resource locks while running others in parallel", async () => {
    const tools = new ToolRegistry();
    const runOrder: string[] = [];
    let concurrentLocks = 0;
    let maxConcurrentLocks = 0;

    tools.register(
      defineTool({
        name: "locked_a",
        description: "",
        parameters: z.object({}),
        locks: ["resource_1"],
        execute: async () => {
          concurrentLocks++;
          maxConcurrentLocks = Math.max(maxConcurrentLocks, concurrentLocks);
          runOrder.push("start:locked_a");
          await new Promise((r) => setTimeout(r, 20));
          runOrder.push("end:locked_a");
          concurrentLocks--;
        },
      }),
    );

    tools.register(
      defineTool({
        name: "locked_b",
        description: "",
        parameters: z.object({}),
        locks: ["resource_1"],
        execute: async () => {
          concurrentLocks++;
          maxConcurrentLocks = Math.max(maxConcurrentLocks, concurrentLocks);
          runOrder.push("start:locked_b");
          await new Promise((r) => setTimeout(r, 20));
          runOrder.push("end:locked_b");
          concurrentLocks--;
        },
      }),
    );

    tools.register(
      defineTool({
        name: "unlocked",
        description: "",
        parameters: z.object({}),
        execute: async () => {
          runOrder.push("start:unlocked");
          await new Promise((r) => setTimeout(r, 5));
          runOrder.push("end:unlocked");
        },
      }),
    );

    let step = 0;
    const model: ModelProvider = {
      generate: (): Promise<ModelResponse> => {
        step++;
        if (step === 1) {
          return Promise.resolve({
            finishReason: "tool_calls",
            toolCalls: [
              { id: "c1", name: "locked_a", args: {} },
              { id: "c2", name: "locked_b", args: {} },
              { id: "c3", name: "unlocked", args: {} },
            ],
          });
        }
        return Promise.resolve({ text: "done", finishReason: "stop" });
      },
    };

    await runLoop("run tools", makeCtx(model, tools));

    // Verify the exact run order demonstrating concurrency and locking
    expect(runOrder).toEqual([
      "start:locked_a",
      "start:unlocked",
      "end:unlocked",
      "end:locked_a",
      "start:locked_b",
      "end:locked_b",
    ]);

    // Locked tools must not execute concurrently. Max concurrent locks must be exactly 1.
    expect(maxConcurrentLocks).toBe(1);
  });

  it("releases locks correctly even when a locked tool throws an error", async () => {
    const tools = new ToolRegistry();
    const runOrder: string[] = [];

    tools.register(
      defineTool({
        name: "failing_locked",
        description: "",
        parameters: z.object({}),
        locks: ["resource_fail"],
        execute: async () => {
          runOrder.push("start:failing_locked");
          await new Promise((r) => setTimeout(r, 10));
          runOrder.push("fail:failing_locked");
          throw new Error("locked tool failed");
        },
      }),
    );

    tools.register(
      defineTool({
        name: "subsequent_locked",
        description: "",
        parameters: z.object({}),
        locks: ["resource_fail"],
        execute: async () => {
          runOrder.push("start:subsequent_locked");
          await new Promise((r) => setTimeout(r, 10));
          runOrder.push("end:subsequent_locked");
        },
      }),
    );

    let step = 0;
    const model: ModelProvider = {
      generate: (): Promise<ModelResponse> => {
        step++;
        if (step === 1) {
          return Promise.resolve({
            finishReason: "tool_calls",
            toolCalls: [
              { id: "c1", name: "failing_locked", args: {} },
              { id: "c2", name: "subsequent_locked", args: {} },
            ],
          });
        }
        return Promise.resolve({ text: "done", finishReason: "stop" });
      },
    };

    await runLoop("run error tools", makeCtx(model, tools));

    // Verify subsequent runs even though the first one failed
    expect(runOrder).toEqual([
      "start:failing_locked",
      "fail:failing_locked",
      "start:subsequent_locked",
      "end:subsequent_locked",
    ]);
  });

  it("handles duplicate lock keys and empty lock arrays gracefully", async () => {
    const tools = new ToolRegistry();
    const runOrder: string[] = [];

    tools.register(
      defineTool({
        name: "dupe_locks",
        description: "",
        parameters: z.object({}),
        locks: ["res", "res"], // duplicate
        execute: async () => {
          runOrder.push("start:dupe");
          runOrder.push("end:dupe");
        },
      }),
    );

    tools.register(
      defineTool({
        name: "empty_locks",
        description: "",
        parameters: z.object({}),
        locks: [], // empty
        execute: async () => {
          runOrder.push("start:empty");
          runOrder.push("end:empty");
        },
      }),
    );

    let step = 0;
    const model: ModelProvider = {
      generate: (): Promise<ModelResponse> => {
        step++;
        if (step === 1) {
          return Promise.resolve({
            finishReason: "tool_calls",
            toolCalls: [
              { id: "c1", name: "dupe_locks", args: {} },
              { id: "c2", name: "empty_locks", args: {} },
            ],
          });
        }
        return Promise.resolve({ text: "done", finishReason: "stop" });
      },
    };

    await runLoop("run edge case tools", makeCtx(model, tools));
    expect(runOrder).toContain("start:dupe");
    expect(runOrder).toContain("start:empty");
  });
});
