import type { StreamEvent } from "./domain/stream.js";
import type { ModelResponse, ToolCall, FinishReason, Usage } from "./domain/messages.js";

/**
 * Drain a provider's stream of `StreamEvent`s into a single `ModelResponse`.
 *
 * Text deltas are accumulated and optionally forwarded token-by-token via `onText`.
 * Tool calls are collected in the order they are emitted.
 * The `finish` event provides the final `finishReason` and token `usage`.
 *
 * @param stream  - The async iterable of events from a `ModelProvider.stream()` call.
 * @param onText  - Optional callback invoked for each text delta as it arrives.
 *                  Use this to stream tokens to a UI or terminal in real time.
 * @returns A `ModelResponse` equivalent to what `generate()` would have returned.
 */
export async function assembleStream(
  stream: AsyncIterable<StreamEvent>,
  onText?: (delta: string) => void,
): Promise<ModelResponse> {
  let text = "";
  const toolCalls: ToolCall[] = [];
  let finishReason: FinishReason = "stop";
  let usage: Usage | undefined;

  for await (const event of stream) {
    if (event.type === "text-delta") {
      text += event.text;
      onText?.(event.text);
    } else if (event.type === "tool-call") {
      toolCalls.push(event.toolCall);
    } else {
      // The only remaining variant in the StreamEvent union is "finish".
      // Checked exhaustively here so TypeScript will catch new union members at compile time.
      // A well-formed stream emits exactly one finish event at the end; if a provider
      // emits multiple, the last one wins.
      finishReason = event.finishReason;
      usage = event.usage;
    }
  }

  return {
    text: text || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason,
    usage,
  };
}
