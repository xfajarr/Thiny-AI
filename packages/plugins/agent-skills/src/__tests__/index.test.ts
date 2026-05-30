import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadAgentSkills } from "../loader.js";
import { writeSkill } from "../writer.js";
import { agentSkillsPlugin } from "../index.js";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};
const silentLogger = {
  info: noop,
  warn: noop,
  error: noop,
  child() {
    return silentLogger as never;
  },
};

function makeTmpDir(): string {
  const dir = join(tmpdir(), `thiny-test-${new Date().getTime().toString()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSkillMd(dir: string, skillId: string, content: string): void {
  const skillDir = join(dir, ".agents", "skills", skillId);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content, "utf8");
}

describe("loadAgentSkills", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when .agents/skills does not exist", () => {
    expect(loadAgentSkills(tmpDir, true)).toHaveLength(0);
  });

  it("loads a skill with YAML frontmatter", () => {
    writeSkillMd(
      tmpDir,
      "find-skills",
      `---
name: Find Skills
description: Helps discover skills from the ecosystem.
---

# Find Skills

Use \`npx skills find\` to search.`,
    );

    const skills = loadAgentSkills(tmpDir, true);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("Find Skills");
    expect(skills[0]?.description).toBe("Helps discover skills from the ecosystem.");
    expect(skills[0]?.instructions).toContain("npx skills find");
    expect(skills[0]?.skillId).toBe("find-skills");
  });

  it("loads multiple skills and sorts by directory name", () => {
    writeSkillMd(tmpDir, "zebra-skill", `---\nname: Zebra\ndescription: Z skill.\n---\n# Z`);
    writeSkillMd(tmpDir, "apple-skill", `---\nname: Apple\ndescription: A skill.\n---\n# A`);
    const skills = loadAgentSkills(tmpDir, true);
    expect(skills).toHaveLength(2);
    expect(skills[0]?.skillId).toBe("apple-skill");
  });

  it("falls back to directory name when frontmatter name is missing", () => {
    writeSkillMd(tmpDir, "my-skill", "# No frontmatter here\n\nJust content.");
    const skills = loadAgentSkills(tmpDir, true);
    expect(skills[0]?.name).toBe("my-skill");
  });
});

describe("writeSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates SKILL.md at the correct project-scope path", async () => {
    const filePath = writeSkill(
      {
        id: "test-skill",
        name: "Test Skill",
        description: "A test.",
        instructions: "Do the thing.",
        scope: "project",
      },
      tmpDir,
    );

    expect(filePath).toContain(join(".agents", "skills", "test-skill", "SKILL.md"));
    const { readFileSync: readFs } = await import("node:fs");
    const content = readFs(filePath, "utf8");
    expect(content).toContain("name: Test Skill");
    expect(content).toContain("Do the thing.");
  });

  it("throws when a skill with the same id already exists", () => {
    writeSkill(
      { id: "dupe", name: "D", description: "D.", instructions: "D.", scope: "project" },
      tmpDir,
    );
    expect(() =>
      writeSkill(
        { id: "dupe", name: "D2", description: "D2.", instructions: "D2.", scope: "project" },
        tmpDir,
      ),
    ).toThrow(/already exists/);
  });
});

describe("agentSkillsPlugin", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("provides the expected set of tools", () => {
    const plugin = agentSkillsPlugin({ cwd: tmpDir });
    const toolNames = (plugin.tools ?? []).map((t) => t.name).sort();
    expect(toolNames).toEqual([
      "skill_create",
      "skill_find",
      "skill_format",
      "skill_install",
      "skill_list",
    ]);
  });

  it("provides a model middleware when injectContext is true (default)", () => {
    const plugin = agentSkillsPlugin({ cwd: tmpDir });
    expect(plugin.modelMiddleware).toHaveLength(1);
  });

  it("does not inject middleware when injectContext is false", () => {
    const plugin = agentSkillsPlugin({ cwd: tmpDir, injectContext: false });
    expect(plugin.modelMiddleware ?? []).toHaveLength(0);
  });

  it("skill_list tool returns loaded skills", async () => {
    writeSkillMd(
      tmpDir,
      "my-skill",
      "---\nname: My Skill\ndescription: A test skill.\n---\n# Instructions",
    );
    const plugin = agentSkillsPlugin({ cwd: tmpDir });
    const tool = plugin.tools?.find((t) => t.name === "skill_list");
    if (!tool) throw new Error("tool not found");
    const result = (await tool.execute({}, { logger: silentLogger } as never)) as {
      count: number;
      skills: Array<{ id: string }>;
    };
    // count includes ~/.agents/skills/ user skills — just verify our skill is present
    expect(result.skills.some((s) => s.id === "my-skill")).toBe(true);
  });

  it("skill_create tool writes a SKILL.md and returns its path", async () => {
    const plugin = agentSkillsPlugin({ cwd: tmpDir });
    const tool = plugin.tools?.find((t) => t.name === "skill_create");
    if (!tool) throw new Error("tool not found");
    const result = (await tool.execute(
      {
        id: "coding-style",
        name: "Coding Style",
        description: "Apply my coding conventions.",
        instructions: "Always use TypeScript strict mode.",
        scope: "project",
      },
      { logger: silentLogger as never } as never,
    )) as { created: string; filePath: string };
    expect(result.created).toBe("coding-style");
    expect(result.filePath).toContain("coding-style");
  });
});
