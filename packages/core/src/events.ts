import type { Logger } from "./ports.js";

/**
 * Events emitted by the kernel during an agent run.
 * Middleware and plugins subscribe to these via `ctx.events.on(...)`.
 */
export type KernelEvent =
  | "onStart"
  | "beforeModelCall"
  | "afterModelCall"
  | "beforeToolCall"
  | "afterToolCall"
  | "onError"
  | "onFinish";

type EventHandler = (payload: unknown) => void;

/**
 * A lightweight synchronous event bus that threads observability through
 * the kernel without coupling it to any specific logging or monitoring library.
 *
 * **Handler contract:** handlers must be fast and must not throw.
 * If a handler throws, the error is logged to `console.error` and the
 * agent continues normally — observability must never crash the agent.
 *
 * **Thread safety:** the bus is synchronous and single-threaded;
 * no locking is required.
 */
export class EventBus {
  private readonly handlers = new Map<KernelEvent, Set<EventHandler>>();

  /**
   * @param logger - Optional logger for reporting handler errors.
   *   When provided, handler exceptions are logged as structured errors
   *   instead of falling back to `console.error`. Pass the agent's session
   *   logger for full observability continuity.
   */
  constructor(private readonly logger?: Logger) {}

  /**
   * Subscribe a handler to an event.
   * The same handler instance can be registered only once per event
   * (Set semantics — duplicates are silently ignored).
   */
  on(event: KernelEvent, handler: EventHandler): void {
    const set = this.handlers.get(event) ?? new Set<EventHandler>();
    set.add(handler);
    this.handlers.set(event, set);
  }

  /** Unsubscribe a previously registered handler. No-op if not registered. */
  off(event: KernelEvent, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event to all registered handlers.
   *
   * Handlers are invoked synchronously in registration order.
   * A throwing handler is caught, reported via the configured logger (or
   * `console.error` as a last resort), and the remaining handlers continue.
   */
  emit(event: KernelEvent, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      try {
        handler(payload);
      } catch (err) {
        // Handler errors must never crash the agent, but must always be visible.
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStack = err instanceof Error ? err.stack : undefined;
        if (this.logger) {
          this.logger.error(
            {
              event: "event_handler_error",
              kernelEvent: event,
              errorMessage: errMsg,
              errorStack: errStack,
            },
            `EventBus handler for "${event}" threw: ${errMsg}`,
          );
        } else {
          // No logger configured — fall back to stderr so the error is never lost.
          console.error(`[thiny/EventBus] handler for "${event}" threw:`, err);
        }
      }
    }
  }
}
