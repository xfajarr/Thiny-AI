import type { ModelProvider, MemoryBackend, Logger } from "./ports.js";
import type { Tool } from "./tool.js";
import type { Message } from "./domain/messages.js";
import type { Ctx } from "./context.js";
import type { EventBus } from "./events.js";
import { ToolRegistry } from "./registry.js";
import { runLoop } from "./loop.js";
import { systemMessage } from "./domain/messages.js";

export interface SpawnOptions {
  input: string;
  tools?: Tool[];
  systemPrompt?: string;
  maxSteps?: number;
}
export type Spawn = (opts: SpawnOptions) => Promise<string>;

interface SpawnDeps {
  model: ModelProvider;
  events: EventBus;
  logger: Logger;
}

function ephemeral(): MemoryBackend {
  return {
    load: () => Promise.resolve([]),
    append: () => Promise.resolve(),
  };
}

/** Create a spawn function that runs scoped child agents sharing model/events/logger. */
export function makeSpawn(deps: SpawnDeps, defaults: { maxSteps: number }): Spawn {
  const spawn: Spawn = async (opts) => {
    const registry = new ToolRegistry();
    for (const t of opts.tools ?? []) registry.register(t);
    const ctx: Ctx = {
      sessionId: "spawn",
      model: deps.model,
      memory: ephemeral(),
      tools: registry,
      events: deps.events,
      logger: deps.logger,
      state: new Map(),
      maxSteps: opts.maxSteps ?? defaults.maxSteps,
      spawn,
    };
    const seed: Message[] = opts.systemPrompt ? [systemMessage(opts.systemPrompt)] : [];
    return runLoop(opts.input, ctx, { seed });
  };
  return spawn;
}
