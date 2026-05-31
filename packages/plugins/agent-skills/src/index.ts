/**
 * @thiny/plugin-agent-skills — skills.sh integration for ThinyAI.
 *
 * Three capabilities:
 *
 * 1. **Understand** — Reads all .agents/skills/<id>/SKILL.md files and injects
 *    their instructions into the agent context via model middleware.
 *    ThinyAI automatically knows and follows every installed skill's guide.
 *
 * 2. **Find** — skill_find tool searches https://skills.sh via `npx skills find`.
 *    skill_list tool shows all installed skills.
 *
 * 3. **Create** — skill_create tool writes a new SKILL.md file so ThinyAI
 *    can author skills on behalf of the user.
 *
 * File structure:
 *   loader.ts — reads .agents/skills/ from disk
 *   writer.ts — creates new SKILL.md files
 *   index.ts  — plugin factory + tools + middleware (this file)
 */
import { z } from "zod";
import { execSync } from "node:child_process";
import { defineTool, type Plugin, type ModelMiddleware } from "@thiny/core";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- re-exported below
import { loadAgentSkills, type AgentSkill } from "./loader.js";
import { writeSkill, SKILL_FORMAT } from "./writer.js";

export { loadAgentSkills, type AgentSkill } from "./loader.js";
export { writeSkill, type SkillTemplate, SKILL_FORMAT } from "./writer.js";

/** Options for `agentSkillsPlugin`. */
export interface AgentSkillsPluginOptions {
  /**
   * Working directory to scan for `.agents/skills/`.
   * Defaults to `process.cwd()`.
   */
  cwd?: string;
  /**
   * Whether to inject skill instructions into the model context automatically.
   * When `true` (default), every model call includes the full text of all
   * installed skills as a system message so the agent follows their guides.
   */
  injectContext?: boolean;
}

/**
 * Agent skills plugin — integrates the skills.sh ecosystem into ThinyAI.
 *
 * On startup, loads all `SKILL.md` files from `.agents/skills/` and (optionally)
 * `~/.agents/skills/`. The agent understands every installed skill automatically.
 *
 * Tools provided:
 * - `skill_list`    — show all installed skills
 * - `skill_find`    — search skills.sh by keyword
 * - `skill_install` — install a skill from skills.sh or GitHub
 * - `skill_create`  — write a new SKILL.md (ThinyAI authors skills)
 *
 * @example
 * ```ts
 * const agent = await createAgent({
 *   model: loadThinyConfig(),
 *   plugins: [agentSkillsPlugin()],
 * });
 * // Agent now knows all skills in .agents/skills/ and can find/install more.
 * ```
 */
export function agentSkillsPlugin(opts: AgentSkillsPluginOptions = {}): Plugin {
  const cwd = opts.cwd ?? process.cwd();
  const injectContext = opts.injectContext ?? true;

  // Load skills once at plugin creation time.
  // Skills are re-read on each model call if you want live reloading,
  // but loading once at startup is simpler and sufficient for most use cases.
  const skills = loadAgentSkills(cwd);

  // ── Context injection middleware ───────────────────────────────────────────

  const skillContextMiddleware: ModelMiddleware = async (req, next) => {
    if (!injectContext || skills.length === 0) return next(req);

    const skillsContent = [
      `[Installed Agent Skills — follow these guides when relevant]`,
      "",
      ...skills.map((s) =>
        [`## Skill: ${s.name}`, `> ${s.description}`, "", s.instructions].join("\n"),
      ),
    ].join("\n");

    const skillMessage = { role: "system" as const, content: skillsContent };

    // Inject after identity/persona but before user's own system prompt
    const [first, ...rest] = req.messages;
    const messages =
      first?.role === "system" && first.content.includes("MUST always refer")
        ? [first, skillMessage, ...rest]
        : [skillMessage, ...req.messages];

    return next({ ...req, messages });
  };

  // ── Tools ──────────────────────────────────────────────────────────────────

  return {
    name: "agent-skills",
    modelMiddleware: injectContext ? [skillContextMiddleware] : [],
    tools: [
      defineTool({
        name: "skill_list",
        description:
          "List all agent skills currently installed in this project and globally. " +
          "Use when the user asks what skills are available, what capabilities exist, " +
          "or wants to see what is installed.",
        parameters: z.object({}),
        execute: (_args, ctx): Promise<unknown> => {
          const current = loadAgentSkills(cwd); // re-read for live state
          ctx.logger.info({ event: "skill_list", count: current.length }, "Listed agent skills");
          return Promise.resolve({
            count: current.length,
            skills: current.map((s) => ({
              id: s.skillId,
              name: s.name,
              description: s.description,
              path: s.filePath,
            })),
          });
        },
      }),

      defineTool({
        name: "skill_find",
        description:
          "Search for agent skills on skills.sh by keyword. " +
          "Use when the user asks 'is there a skill for X', 'find a skill that can help with Y', " +
          "or expresses a need that might be served by an existing community skill. " +
          "Requires npx and internet access.",
        parameters: z.object({
          query: z
            .string()
            .min(1)
            .describe("Search keyword (e.g. 'react testing', 'git workflow')"),
        }),
        execute: ({ query }, ctx): Promise<unknown> => {
          ctx.logger.info({ event: "skill_find", query }, `Searching skills.sh for: ${query}`);
          try {
            const output = execSync(
              `npx --yes skills find ${JSON.stringify(query)} --json 2>/dev/null`,
              {
                timeout: 30_000,
                encoding: "utf8",
              },
            );
            const results = JSON.parse(output) as unknown;
            return Promise.resolve({ query, results });
          } catch {
            // npx skills may not support --json; fall back to text output
            try {
              const text = execSync(`npx --yes skills find ${JSON.stringify(query)} 2>&1`, {
                timeout: 30_000,
                encoding: "utf8",
              });
              return Promise.resolve({ query, output: text });
            } catch (err2) {
              return Promise.resolve({
                query,
                error: `Search failed: ${err2 instanceof Error ? err2.message : String(err2)}`,
                fallback: `Visit https://skills.sh/?q=${encodeURIComponent(query)} to browse manually.`,
              });
            }
          }
        },
      }),

      defineTool({
        name: "skill_install",
        description:
          "Install an agent skill from skills.sh or GitHub. " +
          "Use after skill_find identifies a skill the user wants to install. " +
          "The package format is 'owner/repo@skill-name' (e.g. 'vercel-labs/agent-skills@react-best-practices'). " +
          "Requires npx and internet access.",
        parameters: z.object({
          package: z
            .string()
            .min(1)
            .describe(
              "Skill package identifier, e.g. 'vercel-labs/agent-skills@react-best-practices'",
            ),
          global: z
            .boolean()
            .default(false)
            .describe(
              "Install globally (~/.agents/skills) instead of project-local (.agents/skills)",
            ),
        }),
        execute: ({ package: pkg, global: isGlobal }, ctx): Promise<unknown> => {
          const flags = isGlobal ? "-g -y" : "-y";
          const cmd = `npx --yes skills add ${JSON.stringify(pkg)} ${flags}`;
          ctx.logger.info(
            { event: "skill_install", package: pkg, global: isGlobal },
            `Installing skill: ${pkg}`,
          );
          try {
            const output = execSync(cmd, { timeout: 60_000, encoding: "utf8" });
            return Promise.resolve({
              installed: pkg,
              global: isGlobal,
              output: output.trim(),
              note: "Restart the agent to load the newly installed skill into context.",
            });
          } catch (err) {
            throw new Error(
              `Failed to install skill "${pkg}": ${err instanceof Error ? err.message : String(err)}`,
              { cause: err },
            );
          }
        },
      }),

      defineTool({
        name: "skill_create",
        description:
          "Create a new agent skill by writing a SKILL.md file. " +
          "Use when the user wants to save a workflow, set of instructions, or domain knowledge " +
          "as a reusable skill that ThinyAI will automatically follow in future sessions. " +
          "The skill is immediately available after creation — no restart needed.",
        parameters: z.object({
          id: z
            .string()
            .min(1)
            .regex(/^[a-z0-9-]+$/, "must be kebab-case (lowercase letters, numbers, hyphens)")
            .describe("Unique skill identifier, e.g. 'my-coding-style' or 'project-conventions'"),
          name: z.string().min(1).describe("Human-readable name, e.g. 'My Coding Style'"),
          description: z
            .string()
            .min(1)
            .describe(
              "One sentence describing WHEN this skill should be used — this is what " +
                "the AI reads to decide whether to activate the skill",
            ),
          instructions: z
            .string()
            .min(1)
            .describe(
              "Full Markdown content of the skill — what the AI should do when this skill " +
                "is active. Include when-to-use, step-by-step guide, and examples.",
            ),
          scope: z
            .enum(["project", "user"])
            .default("project")
            .describe(
              "'project' writes to ./.agents/skills/ (shared with team via git), " +
                "'user' writes to ~/.agents/skills/ (personal, all projects)",
            ),
        }),
        execute: ({ id, name, description, instructions, scope }, ctx): Promise<unknown> => {
          const filePath = writeSkill({ id, name, description, instructions, scope }, cwd);
          // Refresh the in-memory skills list so it's immediately usable
          const refreshed = loadAgentSkills(cwd);
          ctx.logger.info({ event: "skill_create", id, scope, filePath }, `Created skill: ${id}`);
          return Promise.resolve({
            created: id,
            filePath,
            scope,
            totalSkills: refreshed.length,
            preview: `---\nname: ${name}\ndescription: ${description}\n---\n\n${instructions.slice(0, 200)}${instructions.length > 200 ? "..." : ""}`,
          });
        },
      }),

      defineTool({
        name: "skill_format",
        description:
          "Show the SKILL.md format so the user or agent knows how to write a skill correctly. " +
          "Use when creating a skill from scratch or when the user asks about the skill format.",
        parameters: z.object({}),
        execute: () => Promise.resolve({ format: SKILL_FORMAT }),
      }),
    ],
  };
}

export default function (_env: Record<string, string | undefined> = process.env): Plugin {
  return agentSkillsPlugin({ cwd: process.cwd(), injectContext: true });
}
