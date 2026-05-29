import type { Tool } from "./tool.js";
import type { MemoryBackend, Logger } from "./ports.js";
import type { Ctx } from "./context.js";
import type { ModelMiddleware, ToolMiddleware } from "./middleware.js";
import type { ToolRegistry } from "./registry.js";

/**
 * A plugin contributes capabilities to the kernel.
 * Every field is optional — the smallest plugin is just `{ name, tools }`.
 */
export interface Plugin {
  name: string;
  tools?: Tool[];
  /** Replace the memory backend (last one wins). */
  memory?: MemoryBackend;
  modelMiddleware?: ModelMiddleware[];
  toolMiddleware?: ToolMiddleware[];
  /** Runs after ALL plugins have registered — may look up sibling tools/services. */
  setup?(ctx: Ctx): Promise<void>;
}

/** Aggregated contributions collected from all plugins during the registration phase. */
export interface PluginExtensions {
  memory?: MemoryBackend;
  middleware: { model: ModelMiddleware[]; tool: ToolMiddleware[] };
}

/** Dependencies injected into `loadPlugins()` by `createAgent()`. */
export interface PluginLoaderDeps {
  /** The shared registry that plugins register tools into during Phase 1. */
  registry: ToolRegistry;
  /**
   * Factory that builds the `Ctx` used during Phase 2 (setup).
   * Called lazily so setup() sees the fully-populated registry.
   */
  makeSetupCtx: () => Ctx;
  /** Structured logger for recording plugin loading progress. */
  logger: Logger;
}

/**
 * Two-phase plugin loader:
 *   **Phase 1 (register):** collect all tools/middleware/memory.
 *   **Phase 2 (setup):**    run each plugin's `setup()` so they can find each other.
 *
 * All tools from all plugins are registered before any `setup()` runs,
 * which allows plugins to look up sibling tools during their own setup.
 *
 * @param plugins - Ordered array of plugins to load.
 * @param deps    - Registry, context factory, and logger.
 */
export async function loadPlugins(
  plugins: Plugin[],
  deps: PluginLoaderDeps,
): Promise<PluginExtensions> {
  const extensions: PluginExtensions = { middleware: { model: [], tool: [] } };

  if (plugins.length === 0) {
    deps.logger.info({ event: "plugins_loaded", count: 0 }, "no plugins to load");
    return extensions;
  }

  deps.logger.info(
    { event: "plugins_loading", plugins: plugins.map((p) => p.name) },
    `Loading ${String(plugins.length)} plugin(s)`,
  );

  // Phase 1: register — every plugin's contributions are visible after this phase.
  for (const plugin of plugins) {
    const toolCount = plugin.tools?.length ?? 0;
    for (const tool of plugin.tools ?? []) deps.registry.register(tool);
    if (plugin.memory) extensions.memory = plugin.memory;
    if (plugin.modelMiddleware) extensions.middleware.model.push(...plugin.modelMiddleware);
    if (plugin.toolMiddleware) extensions.middleware.tool.push(...plugin.toolMiddleware);
    deps.logger.info(
      {
        event: "plugin_registered",
        plugin: plugin.name,
        tools: toolCount,
        modelMiddleware: plugin.modelMiddleware?.length ?? 0,
        toolMiddleware: plugin.toolMiddleware?.length ?? 0,
        memory: plugin.memory !== undefined,
      },
      `Plugin "${plugin.name}" registered`,
    );
  }

  // Phase 2: setup — now every tool/service is visible to all plugins.
  const ctx = deps.makeSetupCtx();
  for (const plugin of plugins) {
    if (plugin.setup) {
      deps.logger.info(
        { event: "plugin_setup_start", plugin: plugin.name },
        `Running setup for "${plugin.name}"`,
      );
      await plugin.setup(ctx);
      deps.logger.info(
        { event: "plugin_setup_done", plugin: plugin.name },
        `Setup complete for "${plugin.name}"`,
      );
    }
  }

  deps.logger.info(
    {
      event: "plugins_ready",
      plugins: plugins.map((p) => p.name),
      totalTools: deps.registry.all().length,
    },
    `${String(plugins.length)} plugin(s) ready, ${String(deps.registry.all().length)} tool(s) registered`,
  );

  return extensions;
}
