/**
 * @thiny/skills — lightweight skill metadata registry.
 *
 * File structure:
 *   definition.ts — SkillDefinition type
 *   catalog.ts    — BUILTIN_SKILLS array (the 10 built-in skills)
 *   registry.ts   — SkillRegistry class (lookup + env check)
 *   community.ts  — loadCommunitySkill / loadCommunitySkills (npm convention)
 *   index.ts      — public barrel (this file)
 *
 * No heavy deps. Plugin creation is handled by the consuming head (heads/cli/src/skills.ts).
 */

export type { SkillDefinition } from "./definition.js";
export { BUILTIN_SKILLS } from "./catalog.js";
export { SkillRegistry } from "./registry.js";
export { loadCommunitySkill, loadCommunitySkills } from "./community.js";

import { SkillRegistry } from "./registry.js";

/** Default global registry pre-populated with all built-in skills. */
export const defaultRegistry = new SkillRegistry();
