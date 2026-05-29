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
   * A throwing handler is caught, reported to `console.error`, and the
   * remaining handlers continue executing.
   */
  emit(event: KernelEvent, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      try {
        handler(payload);
      } catch (err) {
        // Emit errors to stderr so they are visible without crashing the agent.
        console.error(`[thiny/EventBus] handler for "${event}" threw:`, err);
      }
    }
  }
}
