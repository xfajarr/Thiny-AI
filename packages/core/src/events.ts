export type KernelEvent =
  | "onStart"
  | "beforeModelCall"
  | "afterModelCall"
  | "beforeToolCall"
  | "afterToolCall"
  | "onError"
  | "onFinish";

type Handler = (payload: unknown) => void;

/**
 * A tiny synchronous emitter threading observability through the kernel.
 * Handlers must never throw — use middleware for that instead.
 */
export class EventBus {
  private handlers = new Map<KernelEvent, Set<Handler>>();

  on(event: KernelEvent, handler: Handler): void {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(event, set);
  }

  off(event: KernelEvent, handler: Handler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: KernelEvent, payload: unknown): void {
    for (const h of this.handlers.get(event) ?? []) {
      try {
        h(payload);
      } catch {
        /* observability must never crash the agent */
      }
    }
  }
}
