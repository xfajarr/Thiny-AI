/** The `SkillDefinition` type — isolated so registry.ts can import without circular deps. */

/**
 * Metadata describing a Thiny skill.
 * Skills are the user-facing unit of capability — each maps to one or more plugins.
 */
export interface SkillDefinition {
  /** Unique identifier used to load the skill (e.g. `"web-search"`). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** One-line description of what this skill enables. */
  description: string;
  /** Category for grouping in the UI (e.g. `"web"`, `"defi"`, `"ai"`). */
  category: string;
  /** Optional tags for filtering and discovery. */
  tags?: string[];
  /**
   * Environment variables required by this skill.
   * Missing vars are reported at load time so the UI can show which skills are unavailable.
   */
  requiredEnv?: string[];
}
