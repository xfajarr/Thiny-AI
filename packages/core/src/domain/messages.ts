/** A single tool invocation requested by the model. */
export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

/** Token usage for one model call (provider-normalised). */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * The universal currency of the system.
 * Every turn in the conversation is one of these four shapes.
 */
export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

/** Why the model stopped (provider-normalised). */
export type FinishReason = "stop" | "tool_calls" | "length" | "error";

/** What the model returns each step. */
export interface ModelResponse {
  text?: string;
  toolCalls?: ToolCall[];
  finishReason: FinishReason;
  usage?: Usage;
}

export const userMessage = (content: string): Message => ({ role: "user", content });
export const systemMessage = (content: string): Message => ({ role: "system", content });

export function isToolMessage(m: Message): m is Extract<Message, { role: "tool" }> {
  return m.role === "tool";
}
