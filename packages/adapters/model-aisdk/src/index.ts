import { generateText, streamText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ModelProvider, Message, ModelResponse, Tool, FinishReason, StreamEvent } from "@thiny/core";
import { toCoreMessages, toAiTools } from "./convert.js";

function mapFinish(reason: string): FinishReason {
  if (reason === "tool-calls") return "tool_calls";
  if (reason === "length")     return "length";
  if (reason === "error")      return "error";
  return "stop";
}

/** Per-provider connection options. */
export interface ProviderOptions {
  /** Custom base URL — point at any compatible endpoint (Ollama, Together, Groq, etc.). */
  baseURL?: string;
  /** API key override. Falls back to the provider's default env var when omitted. */
  apiKey?: string;
}

export interface AiSdkOptions {
  /**
   * Which model to use. Three forms:
   *
   * 1. Shorthand string   — `"openai:gpt-4o-mini"` / `"anthropic:claude-haiku-4-5-20251001"`
   * 2. Custom-compat      — `"openai-compat:model-id"` + `openai.baseURL` for any OpenAI-compatible API
   * 3. Pre-built instance — pass a `LanguageModel` directly from any `@ai-sdk/*` provider
   */
  model: LanguageModel | string;

  /**
   * OpenAI connection options.
   * Set `baseURL` to use any OpenAI-compatible endpoint:
   *   - Ollama:      `http://localhost:11434/v1`
   *   - LM Studio:   `http://localhost:1234/v1`
   *   - Groq:        `https://api.groq.com/openai/v1`
   *   - Together:    `https://api.together.xyz/v1`
   *   - OpenRouter:  `https://openrouter.ai/api/v1`
   *   - Azure OpenAI, any self-hosted vLLM / llama.cpp server
   */
  openai?: ProviderOptions;

  /**
   * Anthropic connection options.
   * Set `baseURL` to route through a proxy or a compatible backend.
   */
  anthropic?: ProviderOptions;

  maxRetries?: number;
}

function resolveModel(model: LanguageModel | string, opts: AiSdkOptions): LanguageModel {
  if (typeof model !== "string") return model;

  const colonIdx = model.indexOf(":");
  if (colonIdx === -1) throw new Error(`invalid model string "${model}" — expected "provider:model-id"`);

  const provider = model.slice(0, colonIdx);
  const id       = model.slice(colonIdx + 1);

  if (provider === "openai" || provider === "openai-compat") {
    const client = createOpenAI({
      baseURL: opts.openai?.baseURL,
      apiKey:  opts.openai?.apiKey,
    });
    return client(id);
  }

  if (provider === "anthropic") {
    const client = createAnthropic({
      baseURL: opts.anthropic?.baseURL,
      apiKey:  opts.anthropic?.apiKey,
    });
    return client(id);
  }

  throw new Error(
    `unknown provider "${provider}" in model string "${model}"\n` +
    `Supported: "openai:<id>", "openai-compat:<id>", "anthropic:<id>"\n` +
    `Or pass a LanguageModel instance directly.`,
  );
}

// Re-export dynamic factories so callers only need one import.
export { modelFromEnv } from "./env.js";
export { loadThinyConfig, type ThinyConfig } from "./config.js";

export function aiSdkModel(opts: AiSdkOptions): ModelProvider {
  const model = resolveModel(opts.model, opts);

  return {
    async generate(messages: Message[], tools: Tool[]): Promise<ModelResponse> {
      const result = await generateText({
        model,
        messages:   toCoreMessages(messages),
         
        tools:      tools.length !== 0 ? toAiTools(tools) : undefined,
         
        toolChoice: tools.length !== 0 ? "auto"           : undefined,
        maxRetries: opts.maxRetries ?? 2,
      });
      return {
        text: result.text || undefined,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        toolCalls: result.toolCalls?.map((tc) => ({
          id:   tc.toolCallId,
          name: tc.toolName,
          args: tc.args as Record<string, unknown>,
        })),
        finishReason: mapFinish(result.finishReason),
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        usage: result.usage
          ? { inputTokens: result.usage.promptTokens, outputTokens: result.usage.completionTokens }
          : undefined,
      };
    },

    async *stream(messages: Message[], tools: Tool[]): AsyncGenerator<StreamEvent> {
      const result = streamText({
        model,
        messages:   toCoreMessages(messages),
         
        tools:      tools.length !== 0 ? toAiTools(tools) : undefined,
         
        toolChoice: tools.length !== 0 ? "auto"           : undefined,
        maxRetries: opts.maxRetries ?? 2,
      });
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          yield { type: "text-delta", text: part.textDelta };
        } else if (part.type === "tool-call") {
          yield { type: "tool-call", toolCall: { id: part.toolCallId, name: part.toolName, args: part.args as Record<string, unknown> } };
        } else if (part.type === "finish") {
          yield {
            type: "finish",
            finishReason: mapFinish(part.finishReason),
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            usage: part.usage
              ? { inputTokens: part.usage.promptTokens, outputTokens: part.usage.completionTokens }
              : undefined,
          };
        }
      }
    },
  };
}
