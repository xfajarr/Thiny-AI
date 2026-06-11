# @thiny/skills

> Lightweight skill metadata registry for agent capability discovery

[![npm](https://img.shields.io/npm/v/@thiny/skills)](https://www.npmjs.com/package/@thiny/skills)

## Install

```bash
pnpm add @thiny/skills
```

## Usage

```ts
import { SkillRegistry, BUILTIN_SKILLS, loadCommunitySkills } from "@thiny/skills";

const registry = new SkillRegistry();
for (const skill of BUILTIN_SKILLS) {
  registry.register(skill);
}

const skills = registry.findByCategory("defi");
console.log(skills.map(s => s.name));
```

## Public API

| Export | Description |
|--------|-------------|
| `SkillRegistry` | Registry for managing agent skills |
| `BUILTIN_SKILLS` | Pre-defined built-in skills |
| `loadCommunitySkill(path)` | Load a single community skill |
| `loadCommunitySkills(dir)` | Load all skills from a directory |
| `SkillDefinition` | Skill metadata type |
| `defaultRegistry` | Shared singleton registry instance |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/skills)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
