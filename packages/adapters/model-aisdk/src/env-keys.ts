/**
 * Canonical environment variable names used by the model-aisdk adapter.
 *
 * Resolution order for every key: THINY_* takes precedence over the
 * provider-native key (e.g. OPENAI_API_KEY). This lets users override
 * without touching their existing provider-level env vars.
 *
 * Centralised here so both `modelFromEnv` and `loadThinyConfig` share
 * a single source of truth — changing a key name is a one-line edit.
 */
export const ENV_KEYS = {
  model: {
    primary: "THINY_MODEL",
    fallback: "AGENT_MODEL",
    default: "openai:gpt-4o-mini",
  },
  openai: {
    baseURL: { primary: "THINY_OPENAI_BASE_URL", fallback: "OPENAI_BASE_URL" },
    apiKey: { primary: "THINY_OPENAI_API_KEY", fallback: "OPENAI_API_KEY" },
  },
  anthropic: {
    baseURL: { primary: "THINY_ANTHROPIC_BASE_URL", fallback: "ANTHROPIC_BASE_URL" },
    apiKey: { primary: "THINY_ANTHROPIC_API_KEY", fallback: "ANTHROPIC_API_KEY" },
  },
} as const;

/** Read a primary env var with a fallback, returning undefined when both are absent. */
export function readEnvKey(
  key: { primary: string; fallback: string },
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env[key.primary] ?? env[key.fallback];
}
