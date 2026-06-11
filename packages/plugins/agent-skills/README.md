# @thiny/plugin-agent-skills

> Agent skills plugin for skill metadata, loading, and discovery

[![npm](https://img.shields.io/npm/v/@thiny/plugin-agent-skills)](https://www.npmjs.com/package/@thiny/plugin-agent-skills)

## Install

```bash
pnpm add @thiny/plugin-agent-skills
```

## Usage

```ts
import { agentSkillsPlugin, loadAgentSkills, writeSkill } from "@thiny/plugin-agent-skills";

const plugin = agentSkillsPlugin({ skillsDir: "./skills" });
```

## Public API

| Export | Description |
|--------|-------------|
| `agentSkillsPlugin(opts?)` | Agent skills plugin |
| `loadAgentSkills(dir)` | Load skills from a directory |
| `writeSkill(template)` | Generate a skill file |
| `AgentSkill` | Skill definition type |
| `SkillTemplate` | Template for creating skills |
| `SKILL_FORMAT` | Skill file format constant |
| `default` | Auto-configure from env |

[📖 Full API docs →](https://github.com/thiny-ai/thiny/tree/main/packages/plugins/agent-skills)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
