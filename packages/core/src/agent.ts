import type { ModelProvider, MemoryBackend, Logger, Approver } from "./ports.js";
import type { Tool } from "./tool.js";
import type { Message } from "./domain/messages.js";
import type { Signer } from "./signer.js";
import type { Ctx } from "./context.js";
import type { Plugin } from "./plugin.js";
import { ToolRegistry } from "./registry.js";
import { EventBus } from "./events.js";
import { loadPlugins } from "./plugin.js";
import { runLoop } from "./loop.js";
import { composeModel, composeTool } from "./compose.js";
import { assembleStream } from "./stream.js";
import { makeSpawn } from "./spawn.js";
import { systemMessage } from "./domain/messages.js";

class EphemeralMemory implements MemoryBackend {
  private store = new Map<string, Message[]>();
  load(sessionId: string): Promise<Message[]> {
    return Promise.resolve([...(this.store.get(sessionId) ?? [])]);
  }
  append(sessionId: string, messages: Message[]): Promise<void> {
    this.store.set(sessionId, messages);
    return Promise.resolve();
  }
}

const consoleLogger: Logger = {
  info:  (o, m) => { console.error("[info]",  m ?? "", o); },
  warn:  (o, m) => { console.error("[warn]",  m ?? "", o); },
  error: (o, m) => { console.error("[error]", m ?? "", o); },
  child: () => consoleLogger,
};

export interface AgentConfig {
  model: ModelProvider;
  memory?: MemoryBackend;
  tools?: Tool[];
  plugins?: Plugin[];
  systemPrompt?: string;
  maxSteps?: number;
  logger?: Logger;
  signer?: Signer;
  approver?: Approver;
}

export interface Agent {
  run(
    input: string,
    opts?: { sessionId?: string; onToken?: (delta: string) => void },
  ): Promise<string>;
  registry: ToolRegistry;
  events: EventBus;
}

export async function createAgent(config: AgentConfig): Promise<Agent> {
  const registry = new ToolRegistry();
  for (const t of config.tools ?? []) registry.register(t);

  const events = new EventBus();
  const logger = config.logger ?? consoleLogger;

  const collected = await loadPlugins(config.plugins ?? [], {
    registry,
    makeSetupCtx: () =>
      ({
        sessionId: "setup",
        model: config.model,
        memory: config.memory ?? new EphemeralMemory(),
        tools: registry,
        events,
        logger,
        state: new Map(),
        signer: config.signer,
        approver: config.approver,
        maxSteps: config.maxSteps ?? 12,
      }) satisfies Ctx,
  });

  const memory = collected.memory ?? config.memory ?? new EphemeralMemory();

  async function run(
    input: string,
    opts: { sessionId?: string; onToken?: (delta: string) => void } = {},
  ): Promise<string> {
    const sessionId = opts.sessionId ?? "default";
    const ctx: Ctx = {
      sessionId,
      model: config.model,
      memory,
      tools: registry,
      events,
      logger: logger.child({ sessionId }),
      state: new Map(),
      signer: config.signer,
      approver: config.approver,
      maxSteps: config.maxSteps ?? 12,
    };
    ctx.spawn = makeSpawn({ model: config.model, events, logger: ctx.logger }, { maxSteps: ctx.maxSteps });

    const history = await memory.load(sessionId);
    const seed: Message[] =
      config.systemPrompt && !history.some((m) => m.role === "system")
        ? [systemMessage(config.systemPrompt), ...history]
        : history;

    // Composed model generate — streaming path sits inside middleware so all gates apply.
    const generate = composeModel(collected.middleware.model, async (req) => {
      if (opts.onToken && config.model.stream) {
        return assembleStream(config.model.stream(req.messages, req.tools), opts.onToken);
      }
      return config.model.generate(req.messages, req.tools);
    });

    // Composed tool runner — policy / approval / audit all apply here.
    const runTool = composeTool(collected.middleware.tool, async ({ tool, args, ctx: c }) => {
      const parsed = tool.parameters.parse(args);
      return tool.execute(parsed, c);
    });

    const text = await runLoop(input, ctx, {
      seed,
      generate: (messages, tools) => generate({ messages, tools }),
      runTool: async (tool, args, c) => {
        const result = await runTool({ tool, args, ctx: c });
        return JSON.stringify(result ?? null);
      },
    });

    await memory.append(sessionId, [
      ...seed,
      { role: "user", content: input },
      { role: "assistant", content: text },
    ]);

    return text;
  }

  return { run, registry, events };
}
