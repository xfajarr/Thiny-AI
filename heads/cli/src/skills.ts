/**
 * Skill plugin loaders for the Thiny CLI.
 *
 * This is where skill IDs are mapped to actual plugin instances.
 * Plugin creation lives here (not in @thiny/skills) because only the CLI
 * head has access to all plugin packages without circular dependencies.
 */
import type { Plugin } from "@thiny/core";
import { defaultRegistry } from "@thiny/skills";

export interface LoadedSkills {
  plugins: Plugin[];
  warnings: string[];
}

/**
 * Load skills by ID, creating their plugins.
 * Missing env vars produce warnings; the skill is skipped.
 */
export async function loadSkills(
  ids: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<LoadedSkills> {
  const { satisfied, warnings } = defaultRegistry.checkEnv(ids, env);
  const plugins: Plugin[] = [];

  for (const id of satisfied) {
    try {
      const plugin = await createSkillPlugin(id, env);
      if (Array.isArray(plugin)) {
        plugins.push(...plugin);
      } else if (plugin) {
        plugins.push(plugin);
      }
    } catch (err) {
      warnings.push(
        `Failed to load skill "${id}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { plugins, warnings };
}


const BUILTIN_PACKAGES: Record<string, string> = {
  "web-search": "@thiny/plugin-web-search",
  evm: "@thiny/plugin-evm",
  solana: "@thiny/plugin-solana",
  market: "@thiny/plugin-market",
  tokens: "@thiny/plugin-tokens",
  "trading-policy": "@thiny/plugin-trading-policy",
  knowledge: "@thiny/plugin-knowledge",
  resilience: "@thiny/plugin-resilience",
  mcp: "@thiny/mcp",
  "agent-skills": "@thiny/plugin-agent-skills",
};

async function createSkillPlugin(
  id: string,
  env: NodeJS.ProcessEnv,
): Promise<Plugin | Plugin[] | null> {
  const packageName =
    BUILTIN_PACKAGES[id] ?? (id.startsWith("thiny-skill-") ? id : `thiny-skill-${id}`);

  try {
    const mod = (await import(packageName)) as {
      default?: (env: NodeJS.ProcessEnv) => Promise<Plugin | Plugin[]> | Plugin | Plugin[];
    };
    const factory = mod.default;
    if (typeof factory !== "function") {
      throw new Error(`Package "${packageName}" does not export a default factory function.`);
    }
    return await factory(env);
  } catch (err) {
    if (BUILTIN_PACKAGES[id]) {
      throw err;
    }
    return null;
  }
}

