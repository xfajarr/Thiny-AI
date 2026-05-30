/**
 * @thiny/skills — metadata registry for Thiny skills.
 *
 * A skill is a named, categorised capability bundle. This package provides
 * ONLY the metadata (name, description, category, tags, requiredEnv).
 * Plugin creation is handled by the consuming head (e.g. heads/cli).
 *
 * This separation keeps @thiny/skills lightweight — no heavy dependencies
 * like viem or @solana/web3.js are imported here.
 */

// ── Skill metadata ─────────────────────────────────────────────────────────────

/**
 * Metadata describing a Thiny skill.
 * Skills are the user-facing unit of capability — each maps to one or more plugins.
 */
export interface SkillDefinition {
  /** Unique identifier used to load the skill (e.g. "web-search"). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** One-line description of what this skill enables. */
  description: string;
  /** Category for grouping in the UI (e.g. "web", "defi", "ai"). */
  category: string;
  /** Optional tags for filtering and discovery. */
  tags?: string[];
  /**
   * Environment variables required by this skill.
   * Missing vars are reported at load time rather than at startup,
   * so the UI can show which skills are unavailable and why.
   */
  requiredEnv?: string[];
}

// ── Built-in skill catalog ─────────────────────────────────────────────────────

/** All skills that ship with Thiny. Register custom skills with `SkillRegistry.add()`. */
export const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: "web-search",
    name: "Web Search",
    description: "Search the public web via Brave Search API",
    category: "web",
    tags: ["search", "web", "information"],
    requiredEnv: ["BRAVE_API_KEY"],
  },
  {
    id: "evm",
    name: "EVM / Ethereum",
    description: "Read EVM chain state, testnet sends with policy gate",
    category: "defi",
    tags: ["ethereum", "evm", "web3", "blockchain"],
    requiredEnv: ["EVM_RPC_URL"],
  },
  {
    id: "solana",
    name: "Solana",
    description: "Read Solana devnet state, devnet SOL sends",
    category: "defi",
    tags: ["solana", "sol", "web3", "blockchain"],
  },
  {
    id: "market",
    name: "Market Data",
    description: "Token prices via CoinGecko + in-run portfolio tracking",
    category: "defi",
    tags: ["prices", "portfolio", "defi", "trading"],
  },
  {
    id: "tokens",
    name: "Token Ops",
    description: "ERC-20 balance, allowance, approve (unlimited blocked), transfer",
    category: "defi",
    tags: ["erc20", "tokens", "approve", "transfer", "defi"],
    requiredEnv: ["EVM_RPC_URL"],
  },
  {
    id: "trading-policy",
    name: "Trading Policy",
    description: "Asset allowlist + position size cap + slippage ceiling",
    category: "defi",
    tags: ["trading", "policy", "safety", "defi"],
    requiredEnv: ["ALLOWED_ASSETS"],
  },
  {
    id: "knowledge",
    name: "Knowledge / RAG",
    description: "Ingest documents, auto-inject relevant context",
    category: "ai",
    tags: ["rag", "knowledge", "retrieval", "documents"],
  },
  {
    id: "user-memory",
    name: "User Memory",
    description: "Cross-session facts, preferences, session summaries",
    category: "ai",
    tags: ["memory", "personalization", "learning"],
    requiredEnv: ["SESSION_DB"],
  },
  {
    id: "resilience",
    name: "Resilience",
    description: "retry, timeout, rate-limit, cache, idempotency middleware",
    category: "reliability",
    tags: ["retry", "timeout", "cache", "resilience"],
  },
  {
    id: "mcp",
    name: "MCP",
    description: "Connect to any MCP stdio server as instant tools",
    category: "ecosystem",
    tags: ["mcp", "integration", "tools"],
    requiredEnv: ["MCP_COMMAND"],
  },
];

// ── Registry ───────────────────────────────────────────────────────────────────

/**
 * Metadata registry for Thiny skills.
 * Used by the CLI and other heads to display available skills
 * and check which ones are satisfiable in the current environment.
 */
export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();

  constructor(definitions: SkillDefinition[] = BUILTIN_SKILLS) {
    for (const def of definitions) this.skills.set(def.id, def);
  }

  /** Register a custom skill. */
  add(definition: SkillDefinition): void {
    this.skills.set(definition.id, definition);
  }

  /** Look up a skill by ID. Returns undefined when not found. */
  get(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  /** All registered skills, sorted by category then id. */
  all(): SkillDefinition[] {
    return [...this.skills.values()].sort((a, b) =>
      a.category === b.category ? a.id.localeCompare(b.id) : a.category.localeCompare(b.category),
    );
  }

  /** Skills grouped by category for display in the UI. */
  byCategory(): Map<string, SkillDefinition[]> {
    const map = new Map<string, SkillDefinition[]>();
    for (const skill of this.all()) {
      const list = map.get(skill.category) ?? [];
      list.push(skill);
      map.set(skill.category, list);
    }
    return map;
  }

  /**
   * Check which of the given skill IDs are satisfiable given the current env.
   * Returns a list of warnings for unknown or unsatisfied skills.
   */
  checkEnv(
    ids: string[],
    env: NodeJS.ProcessEnv = process.env,
  ): { satisfied: string[]; warnings: string[] } {
    const satisfied: string[] = [];
    const warnings: string[] = [];
    for (const id of ids) {
      const def = this.skills.get(id);
      if (!def) {
        warnings.push(`Unknown skill: "${id}". Run /skills to see available skills.`);
        continue;
      }
      const missing = (def.requiredEnv ?? []).filter((k) => !env[k]);
      if (missing.length > 0) {
        warnings.push(`Skill "${id}" needs: ${missing.join(", ")} — skipping.`);
        continue;
      }
      satisfied.push(id);
    }
    return { satisfied, warnings };
  }
}

/** Default global registry with all built-in skills. */
export const defaultRegistry = new SkillRegistry();
