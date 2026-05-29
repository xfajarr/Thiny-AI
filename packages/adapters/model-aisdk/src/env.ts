import { aiSdkModel, type AiSdkOptions } from "./index.js";
import type { ModelProvider } from "@thiny/core";
import { ENV_KEYS, readEnvKey } from "./env-keys.js";

/**
 * Build a `ModelProvider` entirely from environment variables.
 *
 * No code changes are needed to switch providers — update `.env` only.
 * Resolution order for each key: `THINY_*` → provider-native key → default.
 * The full key mapping is defined in `env-keys.ts`.
 *
 * @param env - Environment to read from. Defaults to `process.env`.
 *   Override in tests to avoid touching the real environment.
 *
 * @example
 * ```ts
 * // Switch to Ollama by updating .env only — no code change required:
 * //   THINY_MODEL=openai-compat:llama3
 * //   THINY_OPENAI_BASE_URL=http://localhost:11434/v1
 * //   THINY_OPENAI_API_KEY=ollama
 * const agent = await createAgent({ model: modelFromEnv(), ... });
 * ```
 */
export function modelFromEnv(env: NodeJS.ProcessEnv = process.env): ModelProvider {
  const model =
    env[ENV_KEYS.model.primary] ?? env[ENV_KEYS.model.fallback] ?? ENV_KEYS.model.default;

  const opts: AiSdkOptions = { model };

  const openaiBaseURL = readEnvKey(ENV_KEYS.openai.baseURL, env);
  const openaiApiKey = readEnvKey(ENV_KEYS.openai.apiKey, env);
  if (openaiBaseURL ?? openaiApiKey) opts.openai = { baseURL: openaiBaseURL, apiKey: openaiApiKey };

  const anthropicBaseURL = readEnvKey(ENV_KEYS.anthropic.baseURL, env);
  const anthropicApiKey = readEnvKey(ENV_KEYS.anthropic.apiKey, env);
  if (anthropicBaseURL ?? anthropicApiKey)
    opts.anthropic = { baseURL: anthropicBaseURL, apiKey: anthropicApiKey };

  return aiSdkModel(opts);
}
