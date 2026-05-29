import type { ModelProvider, MemoryBackend, Logger } from "./ports.js";
import type { Tool } from "./tool.js";
import type { Message } from "./domain/messages.js";
import type { Ctx } from "./context.js";
import type { EventBus } from "./events.js";
import { ToolRegistry } from "./registry.js";
import { runLoop } from "./loop.js";
import { systemMessage } from "./domain/messages.js";

/** Options for a single sub-agent invocation. */
export interface SpawnOptions {
  /** The input prompt for the child agent. */
  input: string;
  /** Tools available to the child. Defaults to no tools if omitted. */
  tools?: Tool[];
  /** System prompt for the child agent. Omit to run without a system prompt. */
  systemPrompt?: string;
  /**
   * Max ReAct steps for this child agent.
   * Defaults to the parent agent's `maxSteps`.
   */
  maxSteps?: number;
}

/**
 * Delegate work to a scoped child agent.
 * Each invocation creates a fresh, isolated context with its own tool registry
 * and ephemeral memory. The child shares the parent's model, event bus, and logger.
 */
export type Spawn = (opts: SpawnOptions) => Promise<string>;

interface SpawnDeps {
  model: ModelProvider;
  events: EventBus;
  logger: Logger;
}

/** Minimal in-memory backend for a single scoped spawn invocation. */
function ephemeralMemory(): MemoryBackend {
  return {
    load: () => Promise.resolve([]),
    append: () => Promise.resolve(),
  };
}

/**
 * Create a `Spawn` function that runs scoped child agents.
 *
 * **Depth limit:** spawned agents can themselves spawn agents, up to `maxSpawnDepth`
 * levels deep (default: 3). This prevents infinite recursion if a tool inadvertently
 * triggers a spawn loop. Exceeding the limit throws a `RangeError`.
 *
 * @param deps             - Services shared from the parent agent.
 * @param defaults         - Default run configuration inherited from the parent.
 * @param defaults.maxSteps       - Max steps per child run.
 * @param defaults.maxSpawnDepth  - Max nesting depth. Default: 3.
 */
export function makeSpawn(
  deps: SpawnDeps,
  defaults: { maxSteps: number; maxSpawnDepth?: number },
): Spawn {
  const maxSpawnDepth = defaults.maxSpawnDepth ?? 3;

  function createSpawnAtDepth(currentDepth: number): Spawn {
    return async (opts: SpawnOptions): Promise<string> => {
      if (currentDepth >= maxSpawnDepth) {
        throw new RangeError(
          `Spawn depth limit of ${String(maxSpawnDepth)} exceeded. ` +
            `Check for recursive spawn calls in your tools or plugins.`,
        );
      }

      const registry = new ToolRegistry();
      for (const tool of opts.tools ?? []) registry.register(tool);

      const ctx: Ctx = {
        sessionId: `spawn:depth${String(currentDepth)}`,
        model: deps.model,
        memory: ephemeralMemory(),
        tools: registry,
        events: deps.events,
        logger: deps.logger.child({ spawnDepth: currentDepth }),
        state: new Map(),
        maxSteps: opts.maxSteps ?? defaults.maxSteps,
        spawn: createSpawnAtDepth(currentDepth + 1),
      };

      const seed: Message[] = opts.systemPrompt ? [systemMessage(opts.systemPrompt)] : [];
      const { text } = await runLoop(opts.input, ctx, { seed });
      return text;
    };
  }

  return createSpawnAtDepth(0);
}
