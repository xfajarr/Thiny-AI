/**
 * create-thiny — scaffold a new Thiny agent project.
 *
 * Usage:
 *   npx create-thiny my-agent
 *   npx create-thiny my-agent --plugins web-search,evm
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { planFiles } from "./generate.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const name = args.find((a) => !a.startsWith("--"));

  if (!name) {
    console.error("Usage: create-thiny <project-name> [--plugins web-search,evm,solana]");
    console.error("\nExamples:");
    console.error("  create-thiny my-bot");
    console.error("  create-thiny web3-agent --plugins web-search,evm");
    process.exit(1);
  }

  const pluginsFlagIdx = args.indexOf("--plugins");
  const pluginsArg = pluginsFlagIdx !== -1 ? (args[pluginsFlagIdx + 1] ?? "") : "";
  const plugins = pluginsArg
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const files = planFiles({ name, plugins });

  for (const file of files) {
    const fullPath = join(process.cwd(), name, file.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.contents, "utf8");
  }

  const pluginSummary =
    plugins.length > 0 ? `with plugins: ${plugins.join(", ")}` : "with no extra plugins";

  console.log(`\n✓ Created ${name}/ ${pluginSummary}\n`);
  console.log("Next steps:");
  console.log(`  cd ${name}`);
  console.log("  cp .env.example .env    # add your OPENAI_API_KEY");
  console.log("  pnpm install");
  console.log('  pnpm agent "Hello!"');
  console.log("\nSwitch providers by editing thiny.config.json or .env — no code changes needed.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
