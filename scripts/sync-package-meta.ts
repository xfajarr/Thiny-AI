#!/usr/bin/env node
/**
 * sync-package-meta.ts — add required metadata fields to every publishable package.
 *
 * Run:  pnpm tsx scripts/sync-package-meta.ts
 *       (dry-run) pnpm tsx scripts/sync-package-meta.ts --dry-run
 *
 * Applies: license, repository, homepage, bugs, engines, keywords, sideEffects,
 *          author, description — following TICKET-01 spec.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const DRY_RUN = process.argv.includes("--dry-run");

// ── Shared defaults ──────────────────────────────────────────────────
const SHARED = {
  license: "MIT",
  author: "Thiny AI",
  engines: { node: ">=20" },
  sideEffects: false,
};

const REPO_BASE = "https://github.com/thiny-ai/thiny";

// ── Per‑package metadata ─────────────────────────────────────────────
interface PkgMeta {
  name: string;
  dir: string;
  description: string;
  keywords: string[];
}

const PACKAGES: PkgMeta[] = [
  // ── Core packages ─────────────────────────────────────────────
  {
    name: "@thiny/core",
    dir: "packages/core",
    description:
      "Thiny AI — lightweight agent kernel with safety middleware, tool routing, and agent loop",
    keywords: ["ai-agent", "llm", "thiny", "agent-kernel", "safety", "middleware", "web3"],
  },
  {
    name: "@thiny/agent",
    dir: "packages/agent",
    description:
      "Thiny AI — pre-assembled agent with all adapters and plugins ready to use",
    keywords: ["ai-agent", "llm", "thiny", "agent", "meta-package", "web3"],
  },
  {
    name: "@thiny/eval",
    dir: "packages/eval",
    description:
      "Thiny AI — evaluation harness for testing and benchmarking agent behaviors",
    keywords: ["ai-agent", "llm", "thiny", "eval", "benchmark", "testing", "web3"],
  },
  {
    name: "@thiny/runtime",
    dir: "packages/runtime",
    description:
      "Thiny AI — cron-based scheduler for running autonomous agents on a heartbeat",
    keywords: ["ai-agent", "llm", "thiny", "runtime", "cron", "scheduler", "autonomous"],
  },
  {
    name: "@thiny/skills",
    dir: "packages/skills",
    description:
      "Thiny AI — lightweight skill metadata registry for agent capability discovery",
    keywords: ["ai-agent", "llm", "thiny", "skills", "registry", "metadata", "discovery"],
  },
  // ── Adapters ─────────────────────────────────────────────────
  {
    name: "@thiny/model-aisdk",
    dir: "packages/adapters/model-aisdk",
    description:
      "Thiny AI — Vercel AI SDK model adapter for OpenAI, Anthropic, and more",
    keywords: ["ai-agent", "llm", "thiny", "model", "ai-sdk", "openai", "anthropic"],
  },
  {
    name: "@thiny/logger-pino",
    dir: "packages/adapters/logger-pino",
    description:
      "Thiny AI — Pino structured logging adapter with secret redaction",
    keywords: ["ai-agent", "llm", "thiny", "logger", "pino", "structured-logging"],
  },
  {
    name: "@thiny/memory-sqlite",
    dir: "packages/adapters/memory-sqlite",
    description:
      "Thiny AI — SQLite persistent memory adapter for agent sessions and state",
    keywords: ["ai-agent", "llm", "thiny", "memory", "sqlite", "persistence", "session"],
  },
  {
    name: "@thiny/memory-vec",
    dir: "packages/adapters/memory-vec",
    description:
      "Thiny AI — vector memory adapter for semantic search and RAG",
    keywords: ["ai-agent", "llm", "thiny", "memory", "vector", "semantic-search", "rag"],
  },
  {
    name: "@thiny/signer-viem",
    dir: "packages/adapters/signer-viem",
    description:
      "Thiny AI — Viem wallet signer adapter for EVM transaction signing",
    keywords: ["ai-agent", "llm", "thiny", "signer", "viem", "wallet", "evm", "transactions"],
  },
  {
    name: "@thiny/mcp",
    dir: "packages/adapters/mcp",
    description:
      "Thiny AI — Model Context Protocol adapter for connecting to tool servers",
    keywords: ["ai-agent", "llm", "thiny", "mcp", "model-context-protocol", "tools"],
  },
  {
    name: "@thiny/otel",
    dir: "packages/adapters/otel",
    description:
      "Thiny AI — OpenTelemetry tracing adapter for distributed agent observability",
    keywords: ["ai-agent", "llm", "thiny", "otel", "opentelemetry", "tracing", "observability"],
  },
  // ── Plugins ──────────────────────────────────────────────────
  {
    name: "@thiny/plugin-evm",
    dir: "packages/plugins/evm",
    description:
      "Thiny AI — EVM blockchain plugin with wallet tools, transaction safety, and mainnet guard",
    keywords: ["ai-agent", "llm", "thiny", "plugin", "evm", "ethereum", "wallet", "defi", "web3"],
  },
  {
    name: "@thiny/plugin-solana",
    dir: "packages/plugins/solana",
    description:
      "Thiny AI — Solana blockchain plugin with wallet tools, SPL tokens, and transaction safety",
    keywords: ["ai-agent", "llm", "thiny", "plugin", "solana", "spl", "wallet", "defi", "web3"],
  },
  {
    name: "@thiny/plugin-web-search",
    dir: "packages/plugins/web-search",
    description:
      "Thiny AI — web search plugin using Brave Search API for real-time information",
    keywords: ["ai-agent", "llm", "thiny", "plugin", "web-search", "brave", "search"],
  },
  {
    name: "@thiny/plugin-tokens",
    dir: "packages/plugins/tokens",
    description:
      "Thiny AI — token research plugin for ERC-20 and SPL token metadata and prices",
    keywords: ["ai-agent", "llm", "thiny", "plugin", "tokens", "erc20", "spl", "defi", "web3"],
  },
  {
    name: "@thiny/plugin-market",
    dir: "packages/plugins/market",
    description:
      "Thiny AI — crypto market data plugin for prices, trends, and on-chain analytics",
    keywords: ["ai-agent", "llm", "thiny", "plugin", "market", "crypto", "defi", "analytics"],
  },
  {
    name: "@thiny/plugin-trading-policy",
    dir: "packages/plugins/trading-policy",
    description:
      "Thiny AI — trading safety policy plugin with approval rules and spending limits",
    keywords: ["ai-agent", "llm", "thiny", "plugin", "trading", "policy", "safety", "defi"],
  },
  {
    name: "@thiny/plugin-resilience",
    dir: "packages/plugins/resilience",
    description:
      "Thiny AI — resilience plugin with rate limiting, retry, and circuit breaking",
    keywords: ["ai-agent", "llm", "thiny", "plugin", "resilience", "rate-limit", "circuit-breaker"],
  },
  {
    name: "@thiny/plugin-knowledge",
    dir: "packages/plugins/knowledge",
    description:
      "Thiny AI — knowledge management plugin with RAG, vector search, and document indexing",
    keywords: ["ai-agent", "llm", "thiny", "plugin", "knowledge", "rag", "vector-search", "indexing"],
  },
  {
    name: "@thiny/plugin-user-memory",
    dir: "packages/plugins/user-memory",
    description:
      "Thiny AI — user memory plugin for personalized agent context and preferences",
    keywords: ["ai-agent", "llm", "thiny", "plugin", "user-memory", "personalization", "context"],
  },
  {
    name: "@thiny/plugin-agent-skills",
    dir: "packages/plugins/agent-skills",
    description:
      "Thiny AI — agent skills plugin for skill metadata, loading, and discovery",
    keywords: ["ai-agent", "llm", "thiny", "plugin", "skills", "discovery", "metadata"],
  },
  // ── Heads (publishable only) ─────────────────────────────────
  {
    name: "@thiny/cli",
    dir: "heads/cli",
    description:
      "Thiny AI — beautiful TUI agent CLI with interactive chat and tool execution",
    keywords: ["ai-agent", "llm", "thiny", "cli", "tui", "terminal", "interactive"],
  },
  // ── Apps (publishable only) ──────────────────────────────────
  {
    name: "create-thiny",
    dir: "apps/create-thiny",
    description:
      "Scaffold a new Thiny AI agent project with one command",
    keywords: ["ai-agent", "llm", "thiny", "scaffold", "create", "boilerplate", "cli"],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────
function repoUrl(dir: string): string {
  return `git+${REPO_BASE}.git`;
}

function repoDir(dir: string): string {
  return dir;
}

function homepageUrl(dir: string): string {
  return `${REPO_BASE}/tree/main/${dir}#readme`;
}

function bugsUrl(): string {
  return `${REPO_BASE}/issues`;
}

// ── Main ─────────────────────────────────────────────────────────────
let updated = 0;
let skipped = 0;

for (const pkg of PACKAGES) {
  const pkgPath = resolve(ROOT, pkg.dir, "package.json");

  let raw: string;
  try {
    raw = readFileSync(pkgPath, "utf-8");
  } catch {
    console.error(`  ✗ ${pkg.name} — package.json not found at ${pkgPath}`);
    continue;
  }

  const json = JSON.parse(raw);
  let changed = false;

  // Fields that are safe to set if missing (or overwrite with template)
  const sets: Record<string, unknown> = {
    license: SHARED.license,
    author: SHARED.author,
    description: pkg.description,
    engines: SHARED.engines,
    sideEffects: SHARED.sideEffects,
    repository: {
      type: "git",
      url: repoUrl(pkg.dir),
      directory: repoDir(pkg.dir),
    },
    homepage: homepageUrl(pkg.dir),
    bugs: { url: bugsUrl() },
    keywords: pkg.keywords,
  };

  for (const [key, value] of Object.entries(sets)) {
    if (JSON.stringify(json[key]) !== JSON.stringify(value)) {
      json[key] = value;
      changed = true;
    }
  }

  if (changed) {
    const out = JSON.stringify(json, null, 2) + "\n";
    if (!DRY_RUN) {
      writeFileSync(pkgPath, out, "utf-8");
    }
    console.log(`  ✓ ${pkg.name} (${pkg.dir})`);
    updated++;
  } else {
    console.log(`  - ${pkg.name} (${pkg.dir}) — already up to date`);
    skipped++;
  }
}

console.log(`\nDone. Updated: ${updated}, skipped: ${skipped}${DRY_RUN ? " [DRY RUN]" : ""}`);
