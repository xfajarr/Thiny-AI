import type { Agent } from "@thiny/core";

/**
 * Format a payload as an SSE (Server-Sent Events) data frame.
 * Each frame is a JSON-encoded line followed by a blank line.
 */
export function sseMessage(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Drive `agent.run` for a single turn and stream output to the caller.
 *
 * - Emits a `{ type: "delta", text }` frame for each token via `onToken`.
 * - Emits `{ type: "done" }` when the run completes successfully.
 * - Emits `{ type: "error", message }` when the run throws.
 *
 * @param agent     - The running agent instance.
 * @param input     - The user's message.
 * @param sessionId - Session to load history from and persist to.
 * @param write     - Callback that receives each SSE frame string.
 */
export async function streamChat(
  agent: Agent,
  input: string,
  sessionId: string,
  write: (chunk: string) => void,
): Promise<void> {
  try {
    await agent.run(input, {
      sessionId,
      onToken: (text) => {
        write(sseMessage({ type: "delta", text }));
      },
    });
    write(sseMessage({ type: "done" }));
  } catch (err) {
    write(
      sseMessage({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
