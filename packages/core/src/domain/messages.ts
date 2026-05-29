/**
 * A single tool invocation requested by the model in one step.
 * The `id` must be echoed back in the corresponding `Message` with `role: "tool"`
 * so the model can correlate results to requests.
 */
export interface ToolCall {
  /** Provider-generated unique identifier for this invocation. */
  id: string;
  /** The tool name exactly as registered in `ToolRegistry`. */
  name: string;
  /** Raw arguments from the model. Will be Zod-validated before execution. */
  args: unknown;
}

/** Token usage for one model call, normalised across providers. */
export interface Usage {
  /** Number of tokens in the input (prompt + conversation history). */
  inputTokens: number;
  /** Number of tokens in the generated output. */
  outputTokens: number;
}

/**
 * A single turn in the conversation — the universal data type of the system.
 *
 * **Field naming note:** the `tool` role uses `toolCallId` (not `id`) and
 * `toolName` (not `name`) intentionally. This mirrors the OpenAI API's
 * `tool_call_id` / `tool_name` convention and makes it unambiguous which field
 * is the correlation key back to a `ToolCall` vs the tool's registered name.
 */
export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | {
      role: "tool";
      /** Must match the `ToolCall.id` this message is responding to. */
      toolCallId: string;
      /** The name of the tool that was executed. */
      toolName: string;
      /** JSON-serialised result from `tool.execute()`, or `ERROR: <message>`. */
      content: string;
    };

/** Why the model stopped generating — normalised across providers. */
export type FinishReason = "stop" | "tool_calls" | "length" | "error";

/** The complete response from one `ModelProvider.generate()` call. */
export interface ModelResponse {
  /** The model's text response. `undefined` when only tool calls were emitted. */
  text?: string;
  /** Tool calls requested by the model. `undefined` when none were requested. */
  toolCalls?: ToolCall[];
  /** Why the model stopped. Always present. */
  finishReason: FinishReason;
  /** Token usage for this call. May be `undefined` if the provider does not report it. */
  usage?: Usage;
}

/** Convenience constructor for a user message. */
export const userMessage = (content: string): Message => ({ role: "user", content });

/** Convenience constructor for a system message. */
export const systemMessage = (content: string): Message => ({ role: "system", content });

/** Type guard: narrows `Message` to the tool-result shape. */
export function isToolMessage(m: Message): m is Extract<Message, { role: "tool" }> {
  return m.role === "tool";
}
