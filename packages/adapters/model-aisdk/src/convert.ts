import type { CoreMessage } from "ai";
import { tool as aiTool } from "ai";
import type { Message, Tool } from "@thiny/core";

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** Our domain Message[] → AI SDK CoreMessage[]. */
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
              result: safeJson(m.content),
            },
          ],
        };
      default:
        throw new Error(`unhandled message role: ${(m as { role: string }).role}`);
    }
  });
}

/** Our Tool[] → AI SDK tool set (no execute — the kernel runs tools itself). */
export function toAiTools(tools: Tool[]): Record<string, ReturnType<typeof aiTool>> {
  const out: Record<string, ReturnType<typeof aiTool>> = {};
  for (const t of tools) {
    out[t.name] = aiTool({ description: t.description, parameters: t.parameters });
  }
  return out;
}
