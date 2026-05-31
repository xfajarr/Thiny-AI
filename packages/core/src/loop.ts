import type { Ctx } from "./context.js";
import type { Message } from "./domain/messages.js";
import type { ModelProvider } from "./ports.js";
import type { Tool } from "./tool.js";
import { MaxStepsError } from "./errors.js";

/**
 * Default tool runner: validates untrusted LLM args via Zod, then calls execute().
 * Validation at this boundary is the primary defence against malformed LLM output.
 */
async function validateAndRunTool(tool: Tool, args: unknown, ctx: Ctx): Promise<string> {
  const parsed = tool.parameters.parse(args);
  const result = await tool.execute(parsed, ctx);
  return JSON.stringify(result ?? null);
}

/** Runs one tool call: emits lifecycle events, delegates to runTool, captures errors. */
async function executeToolCall(
  call: { id: string; name: string; args: unknown },
  runTool: (tool: Tool, args: unknown, ctx: Ctx) => Promise<string>,
  ctx: Ctx,
): Promise<Message & { role: "tool" }> {
  ctx.events.emit("beforeToolCall", { call });
  let content: string;
  try {
    content = await runTool(ctx.tools.get(call.name), call.args, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    content = `ERROR: ${message}`; // ⑥ error-as-observation — feeds failure back to the model
    ctx.events.emit("onError", { call, error: message });
  }
  ctx.events.emit("afterToolCall", { call, content });
  return { role: "tool", toolCallId: call.id, toolName: call.name, content };
}

export interface RunLoopOptions {
  generate?: ModelProvider["generate"];
  runTool?: (tool: Tool, args: unknown, ctx: Ctx) => Promise<string>;
  seed?: Message[];
}

export interface RunLoopResult {
  /** The model's final text response. */
  text: string;
  /** The complete conversation transcript including all tool calls and results. */
  messages: Message[];
}

/**
 * The ReAct loop: THINK (model) → ACT (tools) → OBSERVE (results) → repeat.
 *
 * Key invariants:
 *   ① max-steps guard — circuit breaker against infinite tool loops
 *   ③ termination   — the model (not your code) decides when it is done
 *   ⑤ validate      — Zod-parse LLM args before they reach execute()
 *   ⑥ error-as-obs  — failed tools feed back to the model, no crash
 *
 * Returns both the final text and the full transcript so callers can
 * persist the complete conversation — including intermediate tool calls.
 */
export async function runLoop(
  input: string,
  ctx: Ctx,
  opts: RunLoopOptions = {},
): Promise<RunLoopResult> {
  const generate = opts.generate ?? ctx.model.generate.bind(ctx.model);
  const runTool = opts.runTool ?? validateAndRunTool;

  const messages: Message[] = [...(opts.seed ?? []), { role: "user", content: input }];
  ctx.events.emit("onStart", { sessionId: ctx.sessionId });

  for (let step = 0; step < ctx.maxSteps; step++) {
    // ①
    ctx.events.emit("beforeModelCall", { step, messages });
    const response = await generate(messages, ctx.tools.all()); // ② THINK
    ctx.events.emit("afterModelCall", { step, response });

    messages.push({
      role: "assistant",
      content: response.text ?? "",
      toolCalls: response.toolCalls,
    });

    if (!response.toolCalls?.length) {
      // ③ DONE — the model returned no tool calls.
      // This covers three legitimate cases:
      //   a) toolCalls is undefined (provider didn't include the field)
      //   b) toolCalls is an empty array (provider explicitly said "no calls")
      //   c) finishReason is "stop" — the model is satisfied with its answer
      // In all cases, text may be an empty string — that is a valid response
      // (e.g. the model echoed nothing). The agent caller decides what to do with it.
      const text = response.text ?? "";
      ctx.events.emit("onFinish", { step, text });
      return { text, messages };
    }

    // ④ ACT — execute every requested tool, serializing those with conflicting resource locks
    const lockPromises = new Map<string, Promise<void>>();
    const toolResults: Array<Message & { role: "tool" }> = [];

    const promises = response.toolCalls.map(async (call, index) => {
      const tool = ctx.tools.get(call.name);
      const locks = tool.locks ?? [];

      const acquireLocks = async (): Promise<() => void> => {
        for (;;) {
          const conflicting = locks
            .map((lock) => lockPromises.get(lock))
            .filter((p): p is Promise<void> => p !== undefined);

          if (conflicting.length === 0) {
            let resolve: () => void;
            const promise = new Promise<void>((r) => {
              resolve = r;
            });
            locks.forEach((lock) => lockPromises.set(lock, promise));
            return () => {
              locks.forEach((lock) => {
                if (lockPromises.get(lock) === promise) {
                  lockPromises.delete(lock);
                }
              });
              resolve();
            };
          }

          await Promise.race(conflicting);
        }
      };

      const releaseLocks = await acquireLocks();
      try {
        const res = await executeToolCall(call, runTool, ctx);
        toolResults[index] = res;
      } finally {
        releaseLocks();
      }
    });

    await Promise.all(promises);

    messages.push(...toolResults); // ⑦ OBSERVE → loop back
  }

  throw new MaxStepsError(ctx.maxSteps); // never returns — satisfies Promise<RunLoopResult>
}
