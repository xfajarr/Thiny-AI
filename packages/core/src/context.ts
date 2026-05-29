import type { MemoryBackend, ModelProvider, Logger, Approver } from "./ports.js";
import type { ToolRegistry } from "./registry.js";
import type { EventBus } from "./events.js";
import type { Signer } from "./signer.js";
import type { Spawn } from "./spawn.js";

/**
 * The shared runtime context threaded through the agent loop and every
 * tool's `execute(args, ctx)` call.
 *
 * Use `ctx` inside tool implementations to access shared services without
 * importing any concrete implementation:
 * - `ctx.logger`  — structured logging
 * - `ctx.state`   — per-run scratch space shared between tools in one run
 * - `ctx.signer`  — sign and broadcast transactions (null-check before use)
 * - `ctx.approver`— request human or policy approval (null-check before use)
 * - `ctx.spawn`   — delegate to a scoped child agent (null-check before use)
 */
export interface Ctx {
  /** Unique identifier for the current conversation session. */
  readonly sessionId: string;
  /** The language model provider for this agent instance. */
  readonly model: ModelProvider;
  /** The memory backend persisting conversation history. */
  readonly memory: MemoryBackend;
  /** All tools registered for this agent. */
  readonly tools: ToolRegistry;
  /** Kernel event bus for observability hooks. */
  readonly events: EventBus;
  /** Structured logger bound to the current session. */
  readonly logger: Logger;
  /**
   * Per-run scratch space.
   *
   * Shared between all tools and middleware within a single `agent.run()` call.
   * Cleared on the next run — do not use for data that must survive across runs.
   * Use `ctx.memory` for persistent cross-run state instead.
   */
  readonly state: Map<string, unknown>;
  /**
   * Transaction signer, present only when a signer adapter is configured.
   * Always null-check before use. Throws if `isTestnet` is false and
   * mainnet signing has not been explicitly enabled.
   */
  readonly signer?: Signer;
  /**
   * Human-in-the-loop (or headless policy) approver for sensitive tools.
   * Present only when an approver is configured on `AgentConfig`.
   * Always null-check before use.
   */
  readonly approver?: Approver;
  /**
   * Spawn a scoped child agent with its own tool set and ephemeral memory.
   * The child shares the parent's model, event bus, and logger.
   *
   * Present only after `createAgent` wires it in. Always null-check before use.
   * Spawn depth is limited to prevent infinite recursion.
   */
  spawn?: Spawn;
  /** Maximum number of ReAct steps before `MaxStepsError` is thrown. */
  readonly maxSteps: number;
}
