import type { Ctx } from "./context.js";
import type { Message } from "./domain/messages.js";
import type { ModelProvider } from "./ports.js";
import type { Tool } from "./tool.js";
import { MaxStepsError } from "./errors.js";

async function execTool(tool: Tool, args: unknown, ctx: Ctx): Promise<string> {
  const parsed = tool.parameters.parse(args); // validate untrusted LLM JSON at the boundary
  const result = await tool.execute(parsed, ctx);
  return JSON.stringify(result ?? null);
}

export interface RunLoopOptions {
  generate?: ModelProvider["generate"];
  runTool?: (tool: Tool, args: unknown, ctx: Ctx) => Promise<string>;
  seed?: Message[];
}

/**
 * The ReAct loop: THINK (model) → ACT (tools) → OBSERVE (results) → repeat.
 *
 * Key invariants:
 *   ① max-steps guard — circuit breaker against infinite tool loops
 *   ③ termination   — the model (not your code) decides when it's done
 *   ⑤ validate      — Zod-parse LLM args before they reach execute()
 *   ⑥ error-as-obs  — failed tools feed back to the model, no crash
 */
export async function runLoop(input: string, ctx: Ctx, opts: RunLoopOptions = {}): Promise<string> {
  const generate = opts.generate ?? ctx.model.generate.bind(ctx.model);
  const runTool = opts.runTool ?? execTool;

  const messages: Message[] = [...(opts.seed ?? []), { role: "user", content: input }];
  ctx.events.emit("onStart", { sessionId: ctx.sessionId });

  for (let step = 0; step < ctx.maxSteps; step++) {
    // ①
    ctx.events.emit("beforeModelCall", { step, messages });
    const res = await generate(messages, ctx.tools.all()); // ② THINK
    ctx.events.emit("afterModelCall", { step, res });

    messages.push({ role: "assistant", content: res.text ?? "", toolCalls: res.toolCalls });

    if (!res.toolCalls?.length) {
      // ③ DONE
      ctx.events.emit("onFinish", { step, text: res.text });
      return res.text ?? "";
    }

    const results = await Promise.all(
      // ④ ACT (parallel)
      res.toolCalls.map(async (call) => {
        ctx.events.emit("beforeToolCall", { call });
        let content: string;
        try {
          content = await runTool(ctx.tools.get(call.name), call.args, ctx); // ⑤
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          content = `ERROR: ${msg}`; // ⑥ error-as-observation
          ctx.events.emit("onError", { call, error: msg });
        }
        ctx.events.emit("afterToolCall", { call, content });
        return { role: "tool" as const, toolCallId: call.id, toolName: call.name, content };
      }),
    );
    messages.push(...results); // ⑦ OBSERVE → loop
  }

  throw new MaxStepsError(ctx.maxSteps);
}
