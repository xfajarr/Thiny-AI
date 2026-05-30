/**
 * Creates new SKILL.md files following the standard format.
 * Used by the skill_create tool to let ThinyAI author new skills.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface SkillTemplate {
  /** Slug used as the directory name (kebab-case, e.g. "my-skill"). */
  id: string;
  /** Human-readable name shown in frontmatter. */
  name: string;
  /** One-line description in frontmatter. */
  description: string;
  /** Full Markdown instructions body (after frontmatter). */
  instructions: string;
  /** Where to write: "project" (./.agents/skills/) or "user" (~/.agents/skills/). */
  scope?: "project" | "user";
}

function buildSkillMd(t: SkillTemplate): string {
  return `---
name: ${t.name}
description: ${t.description}
---

${t.instructions.trim()}
`;
}

/**
 * Write a new skill to the appropriate `.agents/skills/<id>/SKILL.md` path.
 *
 * @returns The absolute path to the created SKILL.md file.
 * @throws When a skill with the same id already exists at that location.
 */
export function writeSkill(t: SkillTemplate, cwd = process.cwd()): string {
  const baseDir =
    t.scope === "user" ? join(homedir(), ".agents", "skills") : resolve(cwd, ".agents", "skills");

  const skillDir = join(baseDir, t.id);
  const skillFile = join(skillDir, "SKILL.md");

  if (existsSync(skillFile)) {
    throw new Error(
      `Skill "${t.id}" already exists at ${skillFile}. ` +
        `Delete it first or choose a different id.`,
    );
  }

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillFile, buildSkillMd(t), "utf8");
  return skillFile;
}

/** The canonical SKILL.md format as a string — shown to the agent when creating skills. */
export const SKILL_FORMAT = `---
name: <skill-name>
description: <one line — what this skill does and when to invoke it>
---

# <Skill Name>

## When to Use This Skill

Describe the exact situations when this skill should be activated.
Be specific — this is what the AI reads to decide whether to use it.

## Instructions

Step-by-step instructions for what the AI should do when this skill is active.

## Examples

Concrete input/output examples that illustrate correct usage.
`;
