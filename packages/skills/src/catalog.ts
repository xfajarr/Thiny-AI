/**
 * Built-in skill catalog — all skills that ship with Thiny.
 * Separated from the registry so the catalog can be modified without touching registry logic.
 */
import type { SkillDefinition } from "./definition.js";

/** All skills built into Thiny. Register custom skills with `SkillRegistry.add()`. */
export const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: "web-search",
    name: "Web Search",
    description: "Search the public web via Brave Search API",
    category: "web",
    tags: ["search", "web"],
    requiredEnv: ["BRAVE_API_KEY"],
  },
  {
    id: "evm",
    name: "EVM / Ethereum",
    description: "Read EVM chain state, testnet sends with policy gate",
    category: "defi",
    tags: ["ethereum", "evm", "web3"],
    requiredEnv: ["EVM_RPC_URL"],
  },
  {
    id: "solana",
    name: "Solana",
    description: "Read Solana devnet state, devnet SOL sends",
    category: "defi",
    tags: ["solana", "sol", "web3"],
  },
  {
    id: "market",
    name: "Market Data",
    description: "Token prices via CoinGecko + in-run portfolio tracking",
    category: "defi",
    tags: ["prices", "portfolio", "defi"],
  },
  {
    id: "tokens",
    name: "Token Ops",
    description: "ERC-20 balance, allowance, approve (unlimited blocked), transfer",
    category: "defi",
    tags: ["erc20", "tokens", "approve"],
    requiredEnv: ["EVM_RPC_URL"],
  },
  {
    id: "trading-policy",
    name: "Trading Policy",
    description: "Asset allowlist + position size cap + slippage ceiling",
    category: "defi",
    tags: ["trading", "policy", "safety"],
    requiredEnv: ["ALLOWED_ASSETS"],
  },
  {
    id: "knowledge",
    name: "Knowledge / RAG",
    description: "Ingest documents, auto-inject relevant context",
    category: "ai",
    tags: ["rag", "knowledge", "retrieval"],
  },
  {
    id: "user-memory",
    name: "User Memory",
    description: "Cross-session facts, preferences, session summaries",
    category: "ai",
    tags: ["memory", "personalization"],
    requiredEnv: ["SESSION_DB"],
  },
  {
    id: "resilience",
    name: "Resilience",
    description: "retry, timeout, rate-limit, cache, idempotency middleware",
    category: "reliability",
    tags: ["retry", "timeout", "cache"],
  },
  {
    id: "mcp",
    name: "MCP",
    description: "Connect to any MCP stdio server as instant tools",
    category: "ecosystem",
    tags: ["mcp", "integration"],
    requiredEnv: ["MCP_COMMAND"],
  },
  {
    id: "agent-skills",
    name: "Agent Skills",
    description: "Understand, find, install, and create skills.sh compatible skills",
    category: "ecosystem",
    tags: ["skills", "skills.sh", "community", "find-skills"],
  },
];
