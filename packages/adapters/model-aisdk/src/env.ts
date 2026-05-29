import { aiSdkModel, type AiSdkOptions } from "./index.js";
import type { ModelProvider } from "@thiny/core";

/**
 * Build a ModelProvider entirely from environment variables.
 * No code changes needed to switch providers — just update your .env.
 *
 * Resolution order (first defined wins):
 *
 *   Model string
 *     THINY_MODEL  →  AGENT_MODEL  →  "openai:gpt-4o-mini"
 *
 *   OpenAI / OpenAI-compatible
 *     THINY_OPENAI_BASE_URL  →  OPENAI_BASE_URL
 *     THINY_OPENAI_API_KEY   →  OPENAI_API_KEY
 *
 *   Anthropic
 *     THINY_ANTHROPIC_BASE_URL  →  ANTHROPIC_BASE_URL
 *     THINY_ANTHROPIC_API_KEY   →  ANTHROPIC_API_KEY
 *
 * @example
 * ```ts
 * // In your agent — never change this line again:
 * const agent = await createAgent({ model: modelFromEnv(), ... });
 *
 * // To switch providers, just update .env:
 * //   THINY_MODEL=openai-compat:llama3
 * //   THINY_OPENAI_BASE_URL=http://localhost:11434/v1
 * //   THINY_OPENAI_API_KEY=ollama
 * ```
 */
export function modelFromEnv(env: NodeJS.ProcessEnv = process.env): ModelProvider {
  const model = env.THINY_MODEL ?? env.AGENT_MODEL ?? "openai:gpt-4o-mini";

  const openaiBaseURL = env.THINY_OPENAI_BASE_URL ?? env.OPENAI_BASE_URL;
  const openaiApiKey = env.THINY_OPENAI_API_KEY ?? env.OPENAI_API_KEY;
  const anthropicBaseURL = env.THINY_ANTHROPIC_BASE_URL ?? env.ANTHROPIC_BASE_URL;
  const anthropicApiKey = env.THINY_ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY;

  const opts: AiSdkOptions = { model };
  if (openaiBaseURL || openaiApiKey) opts.openai = { baseURL: openaiBaseURL, apiKey: openaiApiKey };
  if (anthropicBaseURL || anthropicApiKey)
    opts.anthropic = { baseURL: anthropicBaseURL, apiKey: anthropicApiKey };

  return aiSdkModel(opts);
}
