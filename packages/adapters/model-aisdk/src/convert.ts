import type { CoreMessage } from "ai";
import { tool as aiTool } from "ai";
import type { Message, Tool } from "@thiny/core";

/**
 * Attempt to parse JSON from a tool result string.
 * Returns the parsed value on success.
 * If parsing fails, returns the raw string and emits a console warning —
 * this typically means a tool returned a non-JSON string, which is unusual
 * but not fatal (the model will see the raw string as the result).
 */
function tryParseJSON(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    // A tool returned something that isn't valid JSON.
    // Log it so developers notice if this is unintentional.
    console.warn(
      `[thiny/convert] Tool result is not valid JSON — passing raw string to model. Value starts with: "${value.slice(0, 80)}"`,
    );
    return value;
  }
}

/** Map Thiny domain Message[] → AI SDK CoreMessage[]. */
export function toCoreMessages(messages: Message[]): CoreMessage[] {
  return messages.map((m): CoreMessage => {
    switch (m.role) {
      case "system":
        return { role: "system", content: m.content };
      case "user":
        return { role: "user", content: m.content };
      case "assistant":
        if (m.toolCalls?.length) {
          return {
            role: "assistant",
            content: [
              ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
              ...m.toolCalls.map((tc: { id: string; name: string; args: unknown }) => ({
                type: "tool-call" as const,
                toolCallId: tc.id,
                toolName: tc.name,
                args: tc.args as Record<string, unknown>,
              })),
            ],
          };
        }
        return { role: "assistant", content: m.content };
      case "tool":
        return {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: m.toolCallId,
              toolName: m.toolName,
              result: tryParseJSON(m.content),
            },
          ],
        };
      default:
        throw new Error(`unhandled message role: ${(m as { role: string }).role}`);
    }
  });
}

/** Map Thiny Tool[] → AI SDK tool definitions (without execute — the kernel runs tools). */
export function toAiTools(tools: Tool[]): Record<string, ReturnType<typeof aiTool>> {
  const result: Record<string, ReturnType<typeof aiTool>> = {};
  for (const tool of tools) {
    result[tool.name] = aiTool({ description: tool.description, parameters: tool.parameters });
  }
  return result;
}
