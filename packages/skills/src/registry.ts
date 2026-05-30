/**
 * SkillRegistry — lookup and env-satisfaction check for skill definitions.
 * Does NOT create plugins (that responsibility belongs to the consuming head).
 */
import type { SkillDefinition } from "./definition.js";
import { BUILTIN_SKILLS } from "./catalog.js";

/**
 * Metadata registry for Thiny skills.
 * Used by heads to display available skills and check which are satisfiable.
 */
export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();

  constructor(definitions: SkillDefinition[] = BUILTIN_SKILLS) {
    for (const def of definitions) this.skills.set(def.id, def);
  }

  /** Register a custom skill. */
  add(definition: SkillDefinition): void {
    this.skills.set(definition.id, definition);
  }

  /** Look up a skill by ID. Returns `undefined` when not registered. */
  get(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  /** All registered skills, sorted by category then id. */
  all(): SkillDefinition[] {
    return [...this.skills.values()].sort((a, b) =>
      a.category === b.category ? a.id.localeCompare(b.id) : a.category.localeCompare(b.category),
    );
  }

  /** Skills grouped by category for the TUI display panel. */
  byCategory(): Map<string, SkillDefinition[]> {
    const map = new Map<string, SkillDefinition[]>();
    for (const skill of this.all()) {
      const list = map.get(skill.category) ?? [];
      list.push(skill);
      map.set(skill.category, list);
    }
    return map;
  }

  /**
   * Check which skill IDs are satisfiable given the current environment.
   * Returns the IDs that are ready to load and a list of warnings for the rest.
   */
  checkEnv(
    ids: string[],
    env: NodeJS.ProcessEnv = process.env,
  ): {
    satisfied: string[];
    warnings: string[];
  } {
    const satisfied: string[] = [];
    const warnings: string[] = [];
    for (const id of ids) {
      const def = this.skills.get(id);
      if (!def) {
        warnings.push(`Unknown skill: "${id}". Run /skills to see available skills.`);
        continue;
      }
      const missing = (def.requiredEnv ?? []).filter((k) => !env[k]);
      if (missing.length > 0) {
        warnings.push(`Skill "${id}" needs: ${missing.join(", ")} — skipping.`);
        continue;
      }
      satisfied.push(id);
    }
    return { satisfied, warnings };
  }
}
