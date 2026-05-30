/**
 * Loads SKILL.md files from the .agents/skills/ directories.
 *
 * Skill directories are scanned in order (most specific first):
 *   1. ./.agents/skills/        — project-level skills
 *   2. ~/.agents/skills/        — user-level skills (global)
 *
 * Each skill lives in its own directory and must contain a SKILL.md file
 * with YAML frontmatter (name, description) followed by Markdown instructions.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

/** A parsed SKILL.md file. */
export interface AgentSkill {
  /** The skill's unique name (from frontmatter). */
  name: string;
  /** One-line description (from frontmatter). */
  description: string;
  /** Full Markdown content of the skill (excluding frontmatter). */
  instructions: string;
  /** Absolute path to the SKILL.md file. */
  filePath: string;
  /** The directory name that contains the skill. */
  skillId: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const FIELD_RE = /^(\w+):\s*(.+)$/;

function parseFrontmatter(raw: string): { name?: string; description?: string; body: string } {
  const match = FRONTMATTER_RE.exec(raw.trim());
  if (!match) return { body: raw };

  const fields: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const m = FIELD_RE.exec(line.trim());
    if (m) fields[m[1] ?? ""] = (m[2] ?? "").trim();
  }
  return {
    name: fields.name,
    description: fields.description,
    body: (match[2] ?? "").trim(),
  };
}

function scanSkillsDir(dir: string): AgentSkill[] {
  if (!existsSync(dir)) return [];
  const skills: AgentSkill[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(dir, entry.name, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    const raw = readFileSync(skillFile, "utf8");
    const { name, description, body } = parseFrontmatter(raw);

    skills.push({
      name: name ?? entry.name,
      description: description ?? "",
      instructions: body,
      filePath: skillFile,
      skillId: entry.name,
    });
  }

  return skills;
}

/**
 * Load all installed agent skills from the standard search paths.
 * Returns deduplicated skills — project-level takes precedence over user-level.
 *
 * @param cwd         - Working directory to scan for `.agents/skills/`.
 * @param projectOnly - When true, skip `~/.agents/skills/` (useful in tests).
 */
export function loadAgentSkills(cwd = process.cwd(), projectOnly = false): AgentSkill[] {
  const projectDir = resolve(cwd, ".agents", "skills");
  const project = scanSkillsDir(projectDir);

  if (projectOnly) return project;

  const userDir = join(homedir(), ".agents", "skills");
  const user = scanSkillsDir(userDir);

  // Project-level skills override user-level ones with the same id
  const seen = new Set(project.map((s) => s.skillId));
  return [...project, ...user.filter((s) => !seen.has(s.skillId))];
}
