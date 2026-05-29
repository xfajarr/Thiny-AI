import { describe, it, expect } from "vitest";
import { z } from "zod";
import { loadPlugins, type Plugin } from "../plugin.js";
import { ToolRegistry } from "../registry.js";
import { defineTool } from "../tool.js";
import type { Ctx } from "../context.js";
import type { ModelMiddleware, ToolMiddleware } from "../middleware.js";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (): void => {};
const silentLogger = {
  info: noop,
  warn: noop,
  error: noop,
  child() {
    return silentLogger;
  },
};

describe("loadPlugins", () => {
  it("registers tools then runs setup in two phases", async () => {
    const order: string[] = [];
    const a: Plugin = {
      name: "a",
      tools: [
        defineTool({
          name: "a_tool",
          description: "",
          parameters: z.object({}),
          execute: async () => 1,
        }),
      ],
      setup: async (ctx) => {
        order.push("setup-a");
        // Phase 2: tools from OTHER plugins already registered.
        expect(ctx.tools.get("b_tool").name).toBe("b_tool");
      },
    };
    const b: Plugin = {
      name: "b",
      tools: [
        defineTool({
          name: "b_tool",
          description: "",
          parameters: z.object({}),
          execute: async () => 2,
        }),
      ],
      setup: async () => {
        order.push("setup-b");
      },
    };
    const registry = new ToolRegistry();
    const collected = await loadPlugins([a, b], {
      registry,
      makeSetupCtx: () => ({ tools: registry }) as unknown as Ctx,
      logger: silentLogger,
    });
    expect(
      registry
        .all()
        .map((t) => t.name)
        .sort(),
    ).toEqual(["a_tool", "b_tool"]);
    expect(order).toEqual(["setup-a", "setup-b"]);
    expect(collected.middleware.model).toHaveLength(0);
  });

  it("collects model and tool middleware from plugins", async () => {
    const mw: ModelMiddleware = async (req, next) => next(req);
    const tw: ToolMiddleware = async (call, next) => next(call);
    const plugin: Plugin = {
      name: "mw-plugin",
      modelMiddleware: [mw],
      toolMiddleware: [tw],
    };
    const registry = new ToolRegistry();
    const collected = await loadPlugins([plugin], {
      registry,
      makeSetupCtx: () => ({ tools: registry }) as unknown as Ctx,
      logger: silentLogger,
    });
    expect(collected.middleware.model).toHaveLength(1);
    expect(collected.middleware.tool).toHaveLength(1);
  });

  it("collects memory from the last plugin that provides one", async () => {
    const mem1 = { load: () => Promise.resolve([]), append: () => Promise.resolve() };
    const mem2 = { load: () => Promise.resolve([]), append: () => Promise.resolve() };
    const registry = new ToolRegistry();
    const collected = await loadPlugins(
      [
        { name: "first", memory: mem1 },
        { name: "second", memory: mem2 },
      ],
      {
        registry,
        makeSetupCtx: () => ({ tools: registry }) as unknown as Ctx,
        logger: silentLogger,
      },
    );
    expect(collected.memory).toBe(mem2); // last wins
  });

  it("handles plugins with no tools, middleware, or setup gracefully", async () => {
    const registry = new ToolRegistry();
    const collected = await loadPlugins([{ name: "minimal" }], {
      registry,
      makeSetupCtx: () => ({ tools: registry }) as unknown as Ctx,
      logger: silentLogger,
    });
    expect(registry.all()).toHaveLength(0);
    expect(collected.middleware.model).toHaveLength(0);
  });

  it("rejects duplicate tool names across plugins", async () => {
    const tool = defineTool({
      name: "shared",
      description: "",
      parameters: z.object({}),
      execute: async () => 1,
    });
    const registry = new ToolRegistry();
    await expect(
      loadPlugins(
        [
          { name: "p1", tools: [tool] },
          { name: "p2", tools: [tool] },
        ],
        {
          registry,
          makeSetupCtx: () => ({ tools: registry }) as unknown as Ctx,
          logger: silentLogger,
        },
      ),
    ).rejects.toThrow(/already registered/);
  });
});
