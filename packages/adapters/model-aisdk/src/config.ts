import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { aiSdkModel, type AiSdkOptions } from "./index.js";
import type { ModelProvider } from "@thiny/core";
import { ENV_KEYS, readEnvKey } from "./env-keys.js";
import { adapterLogger } from "./adapter-logger.js";

/**
 * Shape of `thiny.config.json`.
 *
 * Any string value may be an `"env:VAR_NAME"` reference resolved at load time,
 * keeping secrets out of committed config files.
 *
 * @example
 * ```json
 * {
 *   "model": "openai-compat:llama3",
 *   "openai": {
 *     "baseURL": "http://localhost:11434/v1",
 *     "apiKey": "env:MY_OLLAMA_KEY"
 *   }
 * }
 * ```
 */
export interface ThinyConfig {
  /** Model string: `"openai:gpt-4o-mini"`, `"anthropic:..."`, `"openai-compat:..."` */
  model?: string;
  openai?: { baseURL?: string; apiKey?: string };
  anthropic?: { baseURL?: string; apiKey?: string };
  maxRetries?: number;
}

/**
 * Resolve an `"env:VAR_NAME"` reference to the variable's value,
 * or return a literal string unchanged.
 * Returns `undefined` when the input is empty or the referenced var is unset.
 */
function resolveConfigValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("env:")) return process.env[value.slice(4)];
  return value;
}

/**
 * Resolve provider options from a config file block, expanding `"env:"` references.
 * Returns `undefined` when the block is absent or both fields resolve to empty.
 */
function resolveProviderOptions(
  options: { baseURL?: string; apiKey?: string } | undefined,
): { baseURL?: string; apiKey?: string } | undefined {
  if (!options) return undefined;
  const resolved = {
    baseURL: resolveConfigValue(options.baseURL),
    apiKey: resolveConfigValue(options.apiKey),
  };
  if (!resolved.baseURL && !resolved.apiKey) return undefined;
  return resolved;
}

/**
 * Load a `thiny.config.json` file and return a `ModelProvider`.
 *
 * Environment variables always override config file values (same resolution
 * order as `modelFromEnv`). The key mapping is defined in `env-keys.ts`.
 *
 * **Config file lookup order:**
 * 1. Explicit `configPath` argument (when provided).
 * 2. `./thiny.config.json` in the current working directory.
 * 3. `./.thinyrc.json` in the current working directory.
 * 4. Falls back to env-only resolution when no config file exists.
 *
 * @param configPath - Optional explicit path to the config file.
 *
 * @throws {Error} When the config file exists but contains invalid JSON.
 *
 * @example `thiny.config.json` with env references
 * ```json
 * { "model": "openai:gpt-4o-mini", "openai": { "apiKey": "env:OPENAI_API_KEY" } }
 * ```
 */
export function loadThinyConfig(configPath?: string): ModelProvider {
  const candidates = configPath
    ? [configPath]
    : [resolve(process.cwd(), "thiny.config.json"), resolve(process.cwd(), ".thinyrc.json")];

  let fileConfig: ThinyConfig = {};
  for (const candidatePath of candidates) {
    if (existsSync(candidatePath)) {
      try {
        fileConfig = JSON.parse(readFileSync(candidatePath, "utf8")) as ThinyConfig;
        // Log which config file was found so users can confirm the right file is being used.
        adapterLogger.info(
          { event: "config_loaded", path: candidatePath },
          `Using config file: ${candidatePath}`,
        );
        break;
      } catch (err: unknown) {
        throw new Error(
          `Failed to parse Thiny config at "${candidatePath}": ` +
            (err instanceof Error ? err.message : String(err)),
          { cause: err },
        );
      }
    }
  }

  // Environment variables take precedence over the config file.
  const model =
    process.env[ENV_KEYS.model.primary] ??
    process.env[ENV_KEYS.model.fallback] ??
    fileConfig.model ??
    ENV_KEYS.model.default;

  const openaiFromEnv = {
    baseURL: readEnvKey(ENV_KEYS.openai.baseURL),
    apiKey: readEnvKey(ENV_KEYS.openai.apiKey),
  };
  const anthropicFromEnv = {
    baseURL: readEnvKey(ENV_KEYS.anthropic.baseURL),
    apiKey: readEnvKey(ENV_KEYS.anthropic.apiKey),
  };

  const openaiFromFile = resolveProviderOptions(fileConfig.openai);
  const anthropicFromFile = resolveProviderOptions(fileConfig.anthropic);

  const adapterOptions: AiSdkOptions = { model, maxRetries: fileConfig.maxRetries };

  const openai = {
    baseURL: openaiFromEnv.baseURL ?? openaiFromFile?.baseURL,
    apiKey: openaiFromEnv.apiKey ?? openaiFromFile?.apiKey,
  };
  if (openai.baseURL ?? openai.apiKey) adapterOptions.openai = openai;

  const anthropic = {
    baseURL: anthropicFromEnv.baseURL ?? anthropicFromFile?.baseURL,
    apiKey: anthropicFromEnv.apiKey ?? anthropicFromFile?.apiKey,
  };
  if (anthropic.baseURL ?? anthropic.apiKey) adapterOptions.anthropic = anthropic;

  return aiSdkModel(adapterOptions);
}

/** Re-export so callers only need one import. */
export { modelFromEnv } from "./env.js";
