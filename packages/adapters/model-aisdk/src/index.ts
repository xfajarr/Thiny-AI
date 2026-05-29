import { generateText, streamText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type {
  ModelProvider,
  Message,
  ModelResponse,
  Tool,
  FinishReason,
  StreamEvent,
  Usage,
} from "@thiny/core";
import { toCoreMessages, toAiTools } from "./convert.js";

// Re-export dynamic factories so callers only need one import.
export { modelFromEnv } from "./env.js";
export { ENV_KEYS, readEnvKey } from "./env-keys.js";
export { loadThinyConfig, type ThinyConfig } from "./config.js";

/** Map AI SDK finish reasons to Thiny's normalised FinishReason. */
function toFinishReason(reason: string): FinishReason {
  if (reason === "tool-calls") return "tool_calls";
  if (reason === "length") return "length";
  if (reason === "error") return "error";
  return "stop";
}

/** Normalise an AI SDK usage object to Thiny's Usage shape. */
function normalizeUsage(
  usage: { promptTokens: number; completionTokens: number } | undefined,
): Usage | undefined {
  if (!usage) return undefined;
  return { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens };
}

/** Build the tool-related fields shared by generateText and streamText. */
function buildToolOptions(tools: Tool[]) {
  if (tools.length === 0) return { tools: undefined, toolChoice: undefined };
  return { tools: toAiTools(tools), toolChoice: "auto" as const };
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
  if (colonIdx === -1) {
    throw new Error(`invalid model string "${model}" — expected "provider:model-id"`);
  }

  const provider = model.slice(0, colonIdx);
  const modelId = model.slice(colonIdx + 1);

  if (provider === "openai" || provider === "openai-compat") {
    return createOpenAI({ baseURL: opts.openai?.baseURL, apiKey: opts.openai?.apiKey })(modelId);
  }

  if (provider === "anthropic") {
    return createAnthropic({ baseURL: opts.anthropic?.baseURL, apiKey: opts.anthropic?.apiKey })(
      modelId,
    );
  }

  throw new Error(
    `unknown provider "${provider}" in model string "${model}"\n` +
      `Supported: "openai:<id>", "openai-compat:<id>", "anthropic:<id>"\n` +
      `Or pass a LanguageModel instance directly.`,
  );
}

/**
 * Create a `ModelProvider` backed by the Vercel AI SDK.
 *
 * Supports all `@ai-sdk/*` providers and any OpenAI-compatible or
 * Anthropic-compatible endpoint via `baseURL` override.
 * Both blocking (`generate`) and streaming (`stream`) are implemented.
 *
 * For env-driven configuration, prefer `modelFromEnv()` or `loadThinyConfig()`.
 *
 * @example
 * ```ts
 * aiSdkModel({ model: "openai:gpt-4o-mini" })
 * aiSdkModel({ model: "openai-compat:llama3", openai: { baseURL: "http://localhost:11434/v1" } })
 * ```
 */
export function aiSdkModel(opts: AiSdkOptions): ModelProvider {
  const model = resolveModel(opts.model, opts);
  const maxRetries = opts.maxRetries ?? 2;

  return {
    async generate(messages: Message[], tools: Tool[]): Promise<ModelResponse> {
      const result = await generateText({
        model,
        messages: toCoreMessages(messages),
        ...buildToolOptions(tools),
        maxRetries,
      });
      return {
        text: result.text || undefined,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        toolCalls: result.toolCalls?.map((tc) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          args: tc.args as Record<string, unknown>,
        })),
        finishReason: toFinishReason(result.finishReason),

        usage: normalizeUsage(result.usage),
      };
    },

    async *stream(messages: Message[], tools: Tool[]): AsyncGenerator<StreamEvent> {
      const result = streamText({
        model,
        messages: toCoreMessages(messages),
        ...buildToolOptions(tools),
        maxRetries,
      });
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          yield { type: "text-delta", text: part.textDelta };
        } else if (part.type === "tool-call") {
          yield {
            type: "tool-call",
            toolCall: {
              id: part.toolCallId,
              name: part.toolName,
              args: part.args as Record<string, unknown>,
            },
          };
        } else if (part.type === "finish") {
          yield {
            type: "finish",
            finishReason: toFinishReason(part.finishReason),

            usage: normalizeUsage(part.usage),
          };
        }
      }
    },
  };
}
