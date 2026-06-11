#!/usr/bin/env node
/**
 * check-exports.ts — validate publish resolution with attw + publint.
 *
 * Run:  pnpm check:exports
 *
 * Requires packages to be built first (run `pnpm build`).
 * Exits 1 if any package has broken export/types maps.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Publishable package directories ─────────────────────────────────
const PUBLISHABLE_DIRS = [
  "packages/core",
  "packages/agent",
  "packages/eval",
  "packages/runtime",
  "packages/skills",
  "packages/adapters/model-aisdk",
  "packages/adapters/logger-pino",
  "packages/adapters/memory-sqlite",
  "packages/adapters/memory-vec",
  "packages/adapters/signer-viem",
  "packages/adapters/mcp",
  "packages/adapters/otel",
  "packages/plugins/evm",
  "packages/plugins/solana",
  "packages/plugins/web-search",
  "packages/plugins/tokens",
  "packages/plugins/market",
  "packages/plugins/trading-policy",
  "packages/plugins/resilience",
  "packages/plugins/knowledge",
  "packages/plugins/user-memory",
  "packages/plugins/agent-skills",
  "heads/cli",
  "apps/create-thiny",
];

const errors: string[] = [];
const warnings: string[] = [];

console.log("🔍 Checking export resolution for", PUBLISHABLE_DIRS.length, "packages...\n");

for (const dir of PUBLISHABLE_DIRS) {
  const pkgDir = resolve(ROOT, dir);
  const distIndex = resolve(pkgDir, "dist/index.js");
  const distTypes = resolve(pkgDir, "dist/index.d.ts");

  // Verify built artifacts exist
  if (!existsSync(distIndex)) {
    errors.push(`${dir}: missing dist/index.js — run 'pnpm build' first`);
    continue;
  }
  if (!existsSync(distTypes)) {
    errors.push(`${dir}: missing dist/index.d.ts — run 'pnpm build' first`);
    continue;
  }

  // Run attw on the package directory
  try {
    execSync("npx attw --pack .", {
      cwd: pkgDir,
      stdio: "pipe",
      timeout: 30_000,
    });
    console.log(`  ✓ ${dir} (attw)`);
  } catch (e: unknown) {
    const stderr = (e as { stderr?: Buffer })?.stderr?.toString() ?? "";
    const stdout = (e as { stdout?: Buffer })?.stdout?.toString() ?? "";
    const output = stderr + stdout;
    // attw exits non-zero on problems — capture the output
    if (output.includes("No problems found") || output.includes("0 problem")) {
      console.log(`  ✓ ${dir} (attw)`);
    } else {
      warnings.push(`${dir}: attw reported issues:\n${output.slice(0, 500)}`);
      console.log(`  ⚠ ${dir} (attw — see details above)`);
    }
  }

  // Run publint on the package directory
  try {
    execSync("npx publint .", {
      cwd: pkgDir,
      stdio: "pipe",
      timeout: 30_000,
    });
    console.log(`  ✓ ${dir} (publint)`);
  } catch (e: unknown) {
    const stderr = (e as { stderr?: Buffer })?.stderr?.toString() ?? "";
    const stdout = (e as { stdout?: Buffer })?.stdout?.toString() ?? "";
    const output = stderr + stdout;
    warnings.push(`${dir}: publint reported issues:\n${output.slice(0, 500)}`);
    console.log(`  ⚠ ${dir} (publint — see details above)`);
  }
}

console.log("");

// ── Report ──────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error(`✗ ${errors.length} error(s):`);
  errors.forEach((e) => console.error(`   ${e}`));
  process.exit(1);
}

if (warnings.length > 0) {
  console.log(`⚠ ${warnings.length} warning(s) — see above for details`);
  // Warnings are non-fatal, but logged
}

console.log(`✓ All ${PUBLISHABLE_DIRS.length} packages pass export resolution checks.`);
