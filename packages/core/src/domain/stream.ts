import type { ToolCall, FinishReason, Usage } from "./messages.js";

/** A normalised streaming event emitted by a provider's stream(). */
export type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolCall: ToolCall }
  | { type: "finish"; finishReason: FinishReason; usage?: Usage };
