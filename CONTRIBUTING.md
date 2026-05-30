# Contributing to Thiny

## Prerequisites

- Node.js ≥ 20
- pnpm 9+
- Git

## Setup

```bash
git clone https://github.com/getthiny/thiny
cd thiny
pnpm install
cp .env.example .env   # add an API key for manual testing
```

## Quality gates (must all pass before committing)

```bash
pnpm test          # 116+ tests
pnpm lint          # ESLint strict — 0 warnings
pnpm exec tsc -b   # TypeScript composite build
pnpm format:check  # Prettier
```

Husky runs `lint-staged` automatically on every commit — ESLint + Prettier on staged files.

---

## How to add a plugin

Plugins are the primary extension point. Every new capability becomes a plugin — the kernel never changes.

### 1. Create the package

```bash
mkdir -p packages/plugins/my-plugin/src/__tests__
```

**`packages/plugins/my-plugin/package.json`**

```json
{
  "name": "@thiny/plugin-my-plugin",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "build": "tsup src/index.ts --config ../../tsup.config.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "zod": "^3" }
}
```

**`packages/plugins/my-plugin/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

### 2. Write the tests first (TDD)

```ts
// src/__tests__/index.test.ts
import { describe, it, expect, vi } from "vitest";
import { myPlugin } from "../index.js";

describe("myPlugin", () => {
  it("registers the correct tool name", () => {
    const plugin = myPlugin({ apiKey: "test" });
    expect(plugin.tools?.[0]?.name).toBe("my_tool");
  });

  it("returns expected data from the tool", async () => {
    const fetchMock = vi.fn(async () => new Response('{"result":"ok"}', { status: 200 }));
    const plugin = myPlugin({ apiKey: "k", fetchImpl: fetchMock });
    const tool = plugin.tools![0]!;
    const out = await tool.execute({ query: "test" }, {} as never);
    expect(out).toMatchObject({ result: "ok" });
  });
});
```

### 3. Implement the plugin

```ts
// src/index.ts
import { z } from "zod";
import { defineTool, type Plugin } from "@thiny/core";

export function myPlugin(opts: { apiKey: string; fetchImpl?: typeof fetch }): Plugin {
  if (!opts.apiKey.trim()) throw new Error("myPlugin: apiKey is required");
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    name: "my-plugin",
    tools: [
      defineTool({
        name: "my_tool",
        description: "What this tool does and when to use it.",
        parameters: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          const res = await fetchImpl(`https://api.example.com?q=${query}`, {
            headers: { Authorization: `Bearer ${opts.apiKey}` },
          });
          if (!res.ok) throw new Error(`my_tool failed: HTTP ${String(res.status)}`);
          return res.json();
        },
      }),
    ],
  };
}
```

### 4. Register in tsconfig + @thiny/agent

Add to `tsconfig.json` references:

```json
{ "path": "packages/plugins/my-plugin" }
```

Add to `packages/agent/src/index.ts`:

```ts
export { myPlugin, type MyPluginOptions } from "@thiny/plugin-my-plugin";
```

### 5. Run tests

```bash
pnpm vitest run packages/plugins/my-plugin
```

---

## Plugin authoring rules

1. **Tool names:** `snake_case`, namespaced by domain (`evm_`, `web_`, `sol_`)
2. **Descriptions:** written for the model, not humans — include when to use it and what it returns
3. **Validation:** all inputs Zod-validated at the boundary; never trust LLM args directly
4. **Sensitive tools:** mark `sensitive: true` for anything that moves value or is destructive
5. **Error messages:** throw with enough context to debug (HTTP status, which field, what was expected)
6. **Tests:** inject `fetchImpl` / fake clients — no real network in unit tests
7. **No model-generated text in policy rules:** decisions from args only — that's the prompt-injection boundary

---

## How to add middleware

Middleware wraps either model calls or tool execution — see `docs/PLUGINS.md` for the full guide.

```ts
// packages/core/src/middleware/my-middleware.ts
import type { ModelMiddleware } from "../middleware.js";

export function myMiddleware(): ModelMiddleware {
  return async (req, next) => {
    const result = await next(req);
    // ... post-process
    return result;
  };
}
```

Export from `packages/core/src/index.ts` and `packages/core/src/middleware/` barrel.

---

## Versioning and releases

Thiny uses [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
# When your changes affect a public API:
pnpm changeset          # describe what changed
git add .changeset/
git commit -m "chore: add changeset"
```

When the "Version Packages" PR is merged, packages are automatically published to npm.

---

## Opening a pull request

Use the PR template (`.github/PULL_REQUEST_TEMPLATE.md`). Checklist:

- [ ] Tests added / updated
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] Changeset added if public API changed
- [ ] Sensitive tools use `sensitive: true` and have a `PolicyRule`
