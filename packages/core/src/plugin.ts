import type { Tool } from "./tool.js";
import type { MemoryBackend } from "./ports.js";
import type { Ctx } from "./context.js";
import type { ModelMiddleware, ToolMiddleware } from "./middleware.js";
import type { ToolRegistry } from "./registry.js";

/**
 * A plugin contributes capabilities to the kernel.
 * Every field is optional — the smallest plugin is just { name, tools }.
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
}

/**
 * Two-phase loader:
 *   Phase 1 (register) — collect all tools/middleware/memory.
 *   Phase 2 (setup)    — run each plugin's setup() so they can find each other.
 */
export async function loadPlugins(
  plugins: Plugin[],
  deps: PluginLoaderDeps,
): Promise<PluginExtensions> {
  const extensions: PluginExtensions = { middleware: { model: [], tool: [] } };

  // Phase 1: register — every plugin's tools/middleware are visible to later phases
  for (const plugin of plugins) {
    for (const tool of plugin.tools ?? []) deps.registry.register(tool);
    if (plugin.memory) extensions.memory = plugin.memory;
    if (plugin.modelMiddleware) extensions.middleware.model.push(...plugin.modelMiddleware);
    if (plugin.toolMiddleware) extensions.middleware.tool.push(...plugin.toolMiddleware);
  }

  // Phase 2: setup — plugins may now look up each other's registered tools/services
  const ctx = deps.makeSetupCtx();
  for (const plugin of plugins) await plugin.setup?.(ctx);

  return extensions;
}
