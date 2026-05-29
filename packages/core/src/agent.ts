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
 * transcript for the given session (UPSERT semantics).
 * Matches the behaviour of the upcoming SQLite adapter.
 */
class EphemeralMemory implements MemoryBackend {
  private readonly store = new Map<string, Message[]>();

  load(sessionId: string): Promise<Message[]> {
    return Promise.resolve([...(this.store.get(sessionId) ?? [])]);
  }

  append(sessionId: string, messages: Message[]): Promise<void> {
    this.store.set(sessionId, messages);
    return Promise.resolve();
  }
}

/** Fallback logger that writes to stderr. Swap for `pinoLogger()` in production. */
const fallbackLogger: Logger = {
  info: (obj, msg) => {
    console.log("[info]", msg ?? "", obj);
  },
  warn: (obj, msg) => {
    console.warn("[warn]", msg ?? "", obj);
  },
  error: (obj, msg) => {
    console.error("[error]", msg ?? "", obj);
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
   * @param input          - The user's message for this turn.
   * @param opts.sessionId - Session to load history from and persist to. Default: `"default"`.
   * @param opts.onToken   - Called for each text delta when streaming is available.
   */
  run(
    input: string,
    opts?: { sessionId?: string; onToken?: (delta: string) => void },
  ): Promise<string>;
  /** The tool registry for this agent. */
  registry: ToolRegistry;
  /** The event bus for this agent. Subscribe to lifecycle events for observability. */
  events: EventBus;
}

/**
 * Create and initialise an agent from the given configuration.
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
  for (const tool of config.tools ?? []) registry.register(tool);

  const logger = config.logger ?? fallbackLogger;
  const events = new EventBus(logger); // pass logger so handler errors use structured logging
  const maxSteps = config.maxSteps ?? 12;

  const extensions = await loadPlugins(config.plugins ?? [], {
    registry,
    logger,
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
        maxSteps,
      }) satisfies Ctx,
  });

  const memory = extensions.memory ?? config.memory ?? new EphemeralMemory();

  async function run(
    input: string,
    opts: { sessionId?: string; onToken?: (delta: string) => void } = {},
  ): Promise<string> {
    const sessionId = opts.sessionId ?? "default";
    const sessionLogger = logger.child({ sessionId });
    const sessionStartedAt = Date.now();

    sessionLogger.info(
      { event: "session_start", sessionId, inputLength: input.length },
      `Session "${sessionId}" started`,
    );

    const ctx: Ctx = {
      sessionId,
      model: config.model,
      memory,
      tools: registry,
      events,
      logger: sessionLogger,
      state: new Map(),
      signer: config.signer,
      approver: config.approver,
      maxSteps,
    };
    ctx.spawn = makeSpawn({ model: config.model, events, logger: sessionLogger }, { maxSteps });

    const history = await memory.load(sessionId);
    const seed: Message[] =
      config.systemPrompt && !history.some((m) => m.role === "system")
        ? [systemMessage(config.systemPrompt), ...history]
        : history;

    const generate = composeModel(extensions.middleware.model, async (req) => {
      if (opts.onToken && config.model.stream) {
        return assembleStream(config.model.stream(req.messages, req.tools), opts.onToken);
      }
      return config.model.generate(req.messages, req.tools);
    });

    const runComposedTool = composeTool(
      extensions.middleware.tool,
      async ({ tool, args, ctx: c }) => {
        const parsed = tool.parameters.parse(args);
        return tool.execute(parsed, c);
      },
    );

    const { text, messages } = await runLoop(input, ctx, {
      seed,
      generate: (msgs, tools) => generate({ messages: msgs, tools }),
      runTool: async (tool, args, c) => {
        const result = await runComposedTool({ tool, args, ctx: c });
        return JSON.stringify(result ?? null);
      },
    });

    if (!text) {
      sessionLogger.warn(
        { event: "session_empty_response", sessionId },
        `Session "${sessionId}" produced an empty response`,
      );
    }

    await memory.append(sessionId, messages);

    const durationMs = Date.now() - sessionStartedAt;
    sessionLogger.info(
      {
        event: "session_end",
        sessionId,
        durationMs,
        toolCallCount: messages.filter((m) => m.role === "tool").length,
        responseLength: text.length,
      },
      `Session "${sessionId}" completed in ${String(durationMs)}ms`,
    );

    return text;
  }

  return { run, registry, events };
}
