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

export interface CollectedExtensions {
  memory?: MemoryBackend;
  middleware: { model: ModelMiddleware[]; tool: ToolMiddleware[] };
}

export interface LoadPluginsDeps {
  registry: ToolRegistry;
  makeSetupCtx: () => Ctx;
}

/**
 * Two-phase loader:
 *   Phase 1 (register) — collect all tools/middleware/memory.
 *   Phase 2 (setup)    — run each plugin's setup() so they can find each other.
 */
export async function loadPlugins(
  plugins: Plugin[],
  deps: LoadPluginsDeps,
): Promise<CollectedExtensions> {
  const collected: CollectedExtensions = { middleware: { model: [], tool: [] } };

  // Phase 1: register
  for (const p of plugins) {
    for (const t of p.tools ?? []) deps.registry.register(t);
    if (p.memory) collected.memory = p.memory;
    if (p.modelMiddleware) collected.middleware.model.push(...p.modelMiddleware);
    if (p.toolMiddleware) collected.middleware.tool.push(...p.toolMiddleware);
  }

  // Phase 2: setup
  const ctx = deps.makeSetupCtx();
  for (const p of plugins) await p.setup?.(ctx);

  return collected;
}
