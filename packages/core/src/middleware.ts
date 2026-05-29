import type { Message, ModelResponse } from "./domain/messages.js";
import type { Tool } from "./tool.js";
import type { Ctx } from "./context.js";

export interface ModelRequest {
  messages: Message[];
  tools: Tool[];
}
export type ModelNext = (req: ModelRequest) => Promise<ModelResponse>;
export type ModelMiddleware = (req: ModelRequest, next: ModelNext) => Promise<ModelResponse>;

export interface ToolCallCtx {
  tool: Tool;
  args: unknown;
  ctx: Ctx;
}
export type ToolNext = (call: ToolCallCtx) => Promise<unknown>;
export type ToolMiddleware = (call: ToolCallCtx, next: ToolNext) => Promise<unknown>;
