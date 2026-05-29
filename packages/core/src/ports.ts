import type { Message, ModelResponse } from "./domain/messages.js";
import type { StreamEvent } from "./domain/stream.js";
import type { Tool } from "./tool.js";

/**
 * PORT: the language model.
 *
 * The kernel depends on this interface only — never on a concrete provider.
 * Adapters (e.g. `@thiny/model-aisdk`) implement it and are injected at
 * construction time via `AgentConfig.model`.
 */
export interface ModelProvider {
  /**
   * Generate a complete response for the given conversation.
   * The kernel calls this once per ReAct step.
   *
   * @param messages - The full conversation history including the current user turn.
   * @param tools    - Tools the model may invoke. Pass an empty array when none are available.
   */
  generate(messages: Message[], tools: Tool[]): Promise<ModelResponse>;

  /**
   * Stream the response token-by-token.
   *
   * Optional — when present and `agent.run` receives an `onToken` callback,
   * the kernel uses `stream` instead of `generate`.
   * The streaming path still runs through the full composed middleware stack
   * (budget, audit, compaction), so all safety gates apply.
   *
   * @param messages - The full conversation history including the current user turn.
   * @param tools    - Tools the model may invoke.
   */
  stream?(messages: Message[], tools: Tool[]): AsyncIterable<StreamEvent>;
}

/**
 * PORT: conversation memory.
 *
 * Stores and retrieves the message transcript for a session.
 * The kernel never knows whether the backing store is RAM, SQLite, or a vector DB.
 *
 * Adapters: `EphemeralMemory` (in-memory, built-in), `@thiny/memory-sqlite`.
 *
 * **Upsert semantics:** `append` replaces the full transcript for a session,
 * not appends to it. This keeps the implementation simple and ensures the
 * stored state is always consistent with what `runLoop` produced.
 */
export interface MemoryBackend {
  /**
   * Load the full message transcript for a session.
   * Returns an empty array when the session has no history.
   */
  load(sessionId: string): Promise<Message[]>;

  /**
   * Persist (overwrite) the full message transcript for a session.
   *
   * @param sessionId - Unique session identifier.
   * @param messages  - The complete transcript to store.
   */
  append(sessionId: string, messages: Message[]): Promise<void>;
}

/**
 * PORT: structured logger.
 *
 * The kernel uses this interface to emit structured log entries without
 * depending on pino, winston, or any concrete library.
 * Pass `@thiny/logger-pino`'s `pinoLogger()` for production use.
 */
export interface Logger {
  /** Log at informational level. `obj` is merged into the log record. */
  info(obj: Record<string, unknown>, msg?: string): void;
  /** Log at warning level. `obj` is merged into the log record. */
  warn(obj: Record<string, unknown>, msg?: string): void;
  /** Log at error level. `obj` is merged into the log record. */
  error(obj: Record<string, unknown>, msg?: string): void;
  /** Return a child logger with additional bound fields (e.g. `{ sessionId }`). */
  child(bindings: Record<string, unknown>): Logger;
}

/** Data passed to an `Approver` when a sensitive tool is about to execute. */
export interface ApprovalRequest {
  /** The name of the tool requesting execution. */
  tool: string;
  /** The parsed, validated arguments the tool will receive. */
  args: unknown;
  /** Human-readable reason for the approval request (from the policy engine). */
  reason: string;
}

/**
 * PORT: human-in-the-loop (or headless policy) gate for sensitive tools.
 *
 * Called by `policyMiddleware` when a `PolicyDecision` with `effect: "approve"`
 * is returned. Return `true` to allow the tool call, `false` to block it.
 *
 * For CLI use: prompt the user interactively.
 * For autonomous/headless use: use `denyApprover` (safe default) or
 * `autoApprover(allowedToolNames)` from `@thiny/core`.
 */
export type Approver = (req: ApprovalRequest) => Promise<boolean>;
