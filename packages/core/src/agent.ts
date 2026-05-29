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

/**
 * In-memory session storage. Each `append` call overwrites the full
 * transcript for the given session (UPSERT semantics) — it does not
 * incrementally add messages. This keeps the implementation trivial
 * and matches the behaviour of the upcoming SQLite adapter.
 */
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

const fallbackLogger: Logger = {
  info: (o, m) => {
    console.log("[info]", m ?? "", o);
  },
  warn: (o, m) => {
    console.warn("[warn]", m ?? "", o);
  },
  error: (o, m) => {
    console.error("[error]", m ?? "", o);
  },
  child: () => fallbackLogger,
};

/** Configuration passed to `createAgent()`. */
export interface AgentConfig {
  /** The language model provider. Use `aiSdkModel()`, `modelFromEnv()`, or `loadThinyConfig()`. */
  model: ModelProvider;
  /** Memory backend for persisting conversation history. Defaults to in-memory (ephemeral). */
  memory?: MemoryBackend;
  /** Tools registered directly on this agent (not via plugins). */
  tools?: Tool[];
  /** Plugins to load. Each contributes tools, middleware, and/or a memory backend. */
  plugins?: Plugin[];
  /** System prompt prepended to the conversation on the first turn of each session. */
  systemPrompt?: string;
  /** Max ReAct steps before `MaxStepsError` is thrown. Default: 12. */
  maxSteps?: number;
  /** Structured logger. Defaults to a console-based fallback. Use `pinoLogger()` in production. */
  logger?: Logger;
  /** Transaction signer for on-chain tools. Absent by default — no signing without explicit opt-in. */
  signer?: Signer;
  /** Approval gate for sensitive tools. Use `denyApprover` (headless) or a CLI prompt (interactive). */
  approver?: Approver;
}

/**
 * A running agent instance returned by `createAgent()`.
 *
 * Reuse the same instance across multiple `run()` calls to share memory,
 * registered tools, and middleware — each call gets its own isolated `state` Map.
 */
export interface Agent {
  /**
   * Run the agent with the given input and return its final text response.
   *
   * @param input      - The user's message for this turn.
   * @param opts.sessionId - Session to load history from and persist to. Default: `"default"`.
   * @param opts.onToken  - Called for each text delta when streaming is available.
   */
  run(
    input: string,
    opts?: { sessionId?: string; onToken?: (delta: string) => void },
  ): Promise<string>;
  /** The tool registry for this agent. Inspect registered tools or add programmatically after creation. */
  registry: ToolRegistry;
  /** The event bus for this agent. Subscribe to lifecycle events for custom observability. */
  events: EventBus;
}

/**
 * Create and initialise an agent from the given configuration.
 *
 * Loads all plugins (two-phase: register then setup), composes middleware,
 * and wires the spawn function. The returned `Agent` is ready to use immediately.
 *
 * @example
 * ```ts
 * const agent = await createAgent({
 *   model: loadThinyConfig(),
 *   systemPrompt: "You are a helpful assistant.",
 *   plugins: [webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY! })],
 * });
 * const reply = await agent.run("What is the weather today?");
 * ```
 */
export async function createAgent(config: AgentConfig): Promise<Agent> {
  const registry = new ToolRegistry();
  for (const t of config.tools ?? []) registry.register(t);

  const events = new EventBus();
  const logger = config.logger ?? fallbackLogger;

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
    ctx.spawn = makeSpawn(
      { model: config.model, events, logger: ctx.logger },
      { maxSteps: ctx.maxSteps },
    );

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
      // args are already Zod-parsed by the policy middleware at this point.
      // Re-parse as defense-in-depth (Zod parse on already-parsed data is cheap).
      const parsed = tool.parameters.parse(args);
      return tool.execute(parsed, c);
    });

    const { text, messages } = await runLoop(input, ctx, {
      seed,
      generate: (msgs, tools) => generate({ messages: msgs, tools }),
      runTool: async (tool, args, c) => {
        const result = await runTool({ tool, args, ctx: c });
        return JSON.stringify(result ?? null);
      },
    });

    // Persist the full transcript — including all intermediate tool calls and
    // results — so the agent retains complete context across restarts.
    await memory.append(sessionId, messages);

    return text;
  }

  return { run, registry, events };
}
