import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { aiSdkModel, type AiSdkOptions } from "./index.js";
import type { ModelProvider } from "@thiny/core";

/**
 * Shape of thiny.config.json.
 * Any value can be a literal or an "env:VAR_NAME" reference resolved at load time.
 */
export interface ThinyConfig {
  /** Model string: "openai:gpt-4o-mini", "anthropic:...", "openai-compat:..." */
  model?: string;
  openai?: {
    baseURL?: string;
    apiKey?: string;
  };
  anthropic?: {
    baseURL?: string;
    apiKey?: string;
  };
  maxRetries?: number;
}

/** Resolve "env:MY_VAR" references inside config values. */
function resolveEnvRef(value: string | undefined): string | undefined {
  if (!value) return value;
  if (value.startsWith("env:")) {
    const varName = value.slice(4);
    return process.env[varName];
  }
  return value;
}

function resolveSection(
  section: { baseURL?: string; apiKey?: string } | undefined,
): { baseURL?: string; apiKey?: string } | undefined {
  if (!section) return undefined;
  const resolved = {
    baseURL: resolveEnvRef(section.baseURL),
    apiKey:  resolveEnvRef(section.apiKey),
  };
  if (!resolved.baseURL && !resolved.apiKey) return undefined;
  return resolved;
}

/**
 * Load a thiny.config.json file and return a ModelProvider.
 * Environment variables override config file values (same resolution order
 * as modelFromEnv).
 *
 * Config file lookup order:
 *   1. Explicit path passed to loadThinyConfig()
 *   2. ./thiny.config.json  (current working directory)
 *   3. Falls back to modelFromEnv() if no config file is found
 *
 * @example thiny.config.json
 * ```json
 * {
 *   "model": "openai-compat:llama3",
 *   "openai": {
 *     "baseURL": "http://localhost:11434/v1",
 *     "apiKey": "ollama"
 *   }
 * }
 * ```
 *
 * @example with env references (keeps secrets out of the config file)
 * ```json
 * {
 *   "model": "openai:gpt-4o-mini",
 *   "openai": { "apiKey": "env:OPENAI_API_KEY" }
 * }
 * ```
 */
export function loadThinyConfig(configPath?: string): ModelProvider {
  // 1. Find and parse the config file
  const candidates = configPath
    ? [configPath]
    : [
        resolve(process.cwd(), "thiny.config.json"),
        resolve(process.cwd(), ".thinyrc.json"),
      ];

  let fileConfig: ThinyConfig = {};
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        fileConfig = JSON.parse(readFileSync(p, "utf8")) as ThinyConfig;
        break;
      } catch (err: unknown) {
        throw new Error(
          `failed to parse Thiny config at ${p}: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    }
  }

  // 2. Env vars override config file (same priority as modelFromEnv)
  const model =
    process.env.THINY_MODEL ??
    process.env.AGENT_MODEL ??
    fileConfig.model ??
    "openai:gpt-4o-mini";

  // Merge: env wins, then config file, then nothing
  const openaiEnv = {
    baseURL: process.env.THINY_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL,
    apiKey:  process.env.THINY_OPENAI_API_KEY  ?? process.env.OPENAI_API_KEY,
  };
  const anthropicEnv = {
    baseURL: process.env.THINY_ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL,
    apiKey:  process.env.THINY_ANTHROPIC_API_KEY  ?? process.env.ANTHROPIC_API_KEY,
  };

  const openaiFile    = resolveSection(fileConfig.openai);
  const anthropicFile = resolveSection(fileConfig.anthropic);

  const merged: AiSdkOptions = {
    model,
    maxRetries: fileConfig.maxRetries,
  };

  const openai = {
    baseURL: openaiEnv.baseURL ?? openaiFile?.baseURL,
    apiKey:  openaiEnv.apiKey  ?? openaiFile?.apiKey,
  };
  if (openai.baseURL || openai.apiKey) merged.openai = openai;

  const anthropic = {
    baseURL: anthropicEnv.baseURL ?? anthropicFile?.baseURL,
    apiKey:  anthropicEnv.apiKey  ?? anthropicFile?.apiKey,
  };
  if (anthropic.baseURL || anthropic.apiKey) merged.anthropic = anthropic;

  return aiSdkModel(merged);
}

/** Re-export so callers only need one import. */
export { modelFromEnv } from "./env.js";
