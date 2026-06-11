#!/usr/bin/env node
/**
 * check-package-meta.ts — assert every publishable package has all required fields.
 *
 * Run:  pnpm tsx scripts/check-package-meta.ts
 *
 * Returns exit code 1 if any package is missing a required field.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Required fields for every publishable package ──────────────────
const REQUIRED_FIELDS = [
  "name",
  "version",
  "license",
  "description",
  "author",
  "repository",
  "homepage",
  "bugs",
  "engines",
  "keywords",
  "sideEffects",
  "files",
  "publishConfig",
] as const;

const REQUIRED_REPO_FIELDS = ["type", "url", "directory"] as const;
const REQUIRED_BUGS_FIELDS = ["url"] as const;
const REQUIRED_ENGINES_FIELDS = ["node"] as const;

// ── Publishable package directories ─────────────────────────────────
const PUBLISHABLE_DIRS = [
  // Core
  "packages/core",
  "packages/agent",
  "packages/eval",
  "packages/runtime",
  "packages/skills",
  // Adapters
  "packages/adapters/model-aisdk",
  "packages/adapters/logger-pino",
  "packages/adapters/memory-sqlite",
  "packages/adapters/memory-vec",
  "packages/adapters/signer-viem",
  "packages/adapters/mcp",
  "packages/adapters/otel",
  // Plugins
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
  // Heads (publishable)
  "heads/cli",
  // Apps (publishable)
  "apps/create-thiny",
];

// ── Side-effects audit (packages with known side effects) ──────────
const SIDE_EFFECT_ALLOWLIST: string[] = [
  // Add package names here if they genuinely need import-time side effects
];

// ── README file check ──────────────────────────────────────────────
const MIN_README_LINES = 15; // must be non-stub README

// ── LICENSE file check ─────────────────────────────────────────────
let errors: string[] = [];
let warnings: string[] = [];

for (const dir of PUBLISHABLE_DIRS) {
  const pkgPath = resolve(ROOT, dir, "package.json");
  const licensePath = resolve(ROOT, dir, "LICENSE");

  if (!existsSync(pkgPath)) {
    errors.push(`MISSING: ${dir}/package.json`);
    continue;
  }

  const raw = readFileSync(pkgPath, "utf-8");
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw);
  } catch {
    errors.push(`INVALID JSON: ${dir}/package.json`);
    continue;
  }

  const name = (json.name as string) || dir;

  // Check top-level fields
  for (const field of REQUIRED_FIELDS) {
    if (json[field] === undefined || json[field] === null) {
      errors.push(`${name}: missing "${field}"`);
    }
  }

  // Check repository sub-fields
  if (json.repository && typeof json.repository === "object") {
    const repo = json.repository as Record<string, unknown>;
    for (const rf of REQUIRED_REPO_FIELDS) {
      if (!repo[rf]) {
        errors.push(`${name}: repository.${rf} missing`);
      }
    }
  }

  // Check bugs sub-fields
  if (json.bugs && typeof json.bugs === "object") {
    const bugs = json.bugs as Record<string, unknown>;
    for (const bf of REQUIRED_BUGS_FIELDS) {
      if (!bugs[bf]) {
        errors.push(`${name}: bugs.${bf} missing`);
      }
    }
  }

  // Check engines sub-fields
  if (json.engines && typeof json.engines === "object") {
    const engines = json.engines as Record<string, unknown>;
    for (const ef of REQUIRED_ENGINES_FIELDS) {
      if (!engines[ef]) {
        errors.push(`${name}: engines.${ef} missing`);
      }
    }
  }

  // Check sideEffects (must be explicit)
  if (json.sideEffects !== false && !SIDE_EFFECT_ALLOWLIST.includes(name)) {
    errors.push(`${name}: sideEffects must be false (found: ${JSON.stringify(json.sideEffects)})`);
  }

  // Check keywords is a non-empty array
  if (!Array.isArray(json.keywords) || (json.keywords as unknown[]).length === 0) {
    errors.push(`${name}: keywords must be a non-empty array`);
  }

  // Check LICENSE file
  if (!existsSync(licensePath)) {

  // Check README file
  const readmePath = resolve(ROOT, dir, "README.md");
  if (!existsSync(readmePath)) {
    errors.push(`${name}: missing README.md in ${dir}/`);
  } else {
    const readmeContent = readFileSync(readmePath, "utf-8");
    const lineCount = readmeContent.split("\n").filter(l => l.trim().length > 0).length;
    if (lineCount < MIN_README_LINES) {
      errors.push(`${name}: README.md too short (${lineCount} non-empty lines, min ${MIN_README_LINES})`);
    }
  }

    errors.push(`${name}: missing LICENSE file in ${dir}/`);
  }
}

// ── Report ──────────────────────────────────────────────────────────
if (warnings.length > 0) {
  console.log("⚠  Warnings:");
  warnings.forEach((w) => console.log(`   ${w}`));
}

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} error(s) found:\n`);
  errors.forEach((e) => console.error(`   ${e}`));
  console.error("\nRun: pnpm tsx scripts/sync-package-meta.ts\n");
  process.exit(1);
}

console.log(`✓ All ${PUBLISHABLE_DIRS.length} publishable packages pass metadata checks.`);
