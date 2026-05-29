import { describe, it, expect } from "vitest";
import { planFiles, renderAgentFile } from "../generate.js";

describe("scaffolder", () => {
  it("includes selected plugin imports in the generated agent file", () => {
    const code = renderAgentFile({ name: "demo", plugins: ["web-search", "evm"] });
    expect(code).toContain("web-search");
    expect(code).toContain("evm");
    expect(code).not.toContain("plugin-solana");
  });

  it("produces exactly the required output files", () => {
    const files = planFiles({ name: "demo", plugins: [] });
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual([".env.example", "package.json", "src/agent.ts", "thiny.config.json"]);
  });

  it("generated package.json contains the correct project name", () => {
    const files = planFiles({ name: "my-app", plugins: [] });
    const pkg = files.find((f) => f.path === "package.json");
    if (!pkg) throw new Error("package.json not found");
    const parsed = JSON.parse(pkg.contents) as { name: string };
    expect(parsed.name).toBe("my-app");
  });
});
