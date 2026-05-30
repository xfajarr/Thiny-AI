/**
 * Community skill loader — loads skills from npm packages following the `thiny-skill-*` convention.
 * Separated so the registry stays lightweight and this can be tree-shaken when unused.
 */
import type { SkillDefinition } from "./definition.js";
import type { SkillRegistry } from "./registry.js";

/**
 * Load a single community skill from npm.
 *
 * Looks for a package named `thiny-skill-<id>` that exports a default
 * `SkillDefinition` or `SkillDefinition[]`. The skill is registered into
 * the provided registry on success.
 *
 * @returns `true` when the skill was found and registered, `false` otherwise.
 *
 * @example
 * ```bash
 * npm install thiny-skill-github
 * ```
 * ```ts
 * await loadCommunitySkill("github", registry);
 * ```
 */
export async function loadCommunitySkill(id: string, registry: SkillRegistry): Promise<boolean> {
  const packageName = id.startsWith("thiny-skill-") ? id : `thiny-skill-${id}`;
  try {
    const mod = (await import(packageName)) as { default?: SkillDefinition | SkillDefinition[] };
    const defs = mod.default;
    if (!defs) return false;
    const list = Array.isArray(defs) ? defs : [defs];
    for (const def of list) registry.add(def);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load multiple community skills by IDs and return the ones that loaded successfully.
 *
 * @example
 * ```ts
 * const loaded = await loadCommunitySkills(["github", "obsidian"], registry);
 * // loaded = ["github"] if thiny-skill-obsidian is not installed
 * ```
 */
export async function loadCommunitySkills(
  ids: string[],
  registry: SkillRegistry,
): Promise<string[]> {
  const loaded: string[] = [];
  for (const id of ids) {
    const ok = await loadCommunitySkill(id, registry);
    if (ok) loaded.push(id);
  }
  return loaded;
}
