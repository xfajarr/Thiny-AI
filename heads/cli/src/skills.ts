/**
 * Skill plugin loaders for the Thiny CLI.
 *
 * This is where skill IDs are mapped to actual plugin instances.
 * Plugin creation lives here (not in @thiny/skills) because only the CLI
 * head has access to all plugin packages without circular dependencies.
 */
import type { Plugin } from "@thiny/core";
import { defaultRegistry } from "@thiny/skills";

export interface LoadedSkills {
  plugins: Plugin[];
  warnings: string[];
}

/**
 * Load skills by ID, creating their plugins.
 * Missing env vars produce warnings; the skill is skipped.
 */
export async function loadSkills(
  ids: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<LoadedSkills> {
  const { satisfied, warnings } = defaultRegistry.checkEnv(ids, env);
  const plugins: Plugin[] = [];

  for (const id of satisfied) {
    try {
      const plugin = await createSkillPlugin(id, env);
      if (Array.isArray(plugin)) {
        plugins.push(...plugin);
      } else if (plugin) {
        plugins.push(plugin);
      }
    } catch (err) {
      warnings.push(
        `Failed to load skill "${id}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { plugins, warnings };
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
async function createSkillPlugin(
  id: string,
  env: NodeJS.ProcessEnv,
): Promise<Plugin | Plugin[] | null> {
  switch (id) {
    case "web-search": {
      const { webSearchPlugin } = await import("@thiny/plugin-web-search");
      return webSearchPlugin({ apiKey: env.BRAVE_API_KEY ?? "" });
    }

    case "evm": {
      const { createPublicClient, http } = await import("viem");
      const { sepolia } = await import("viem/chains");
      const { evmPlugin } = await import("@thiny/plugin-evm");
      const publicClient = createPublicClient({ chain: sepolia, transport: http(env.EVM_RPC_URL) });
      return evmPlugin({ publicClient, chainId: 11155111, isTestnet: true });
    }

    case "solana": {
      const { solanaPlugin } = await import("@thiny/plugin-solana");
      return solanaPlugin({ cluster: "devnet" });
    }

    case "market": {
      const { marketPlugin } = await import("@thiny/plugin-market");
      return marketPlugin();
    }

    case "tokens": {
      const { createPublicClient, http } = await import("viem");
      const { sepolia } = await import("viem/chains");
      const { tokensPlugin } = await import("@thiny/plugin-tokens");
      const publicClient = createPublicClient({ chain: sepolia, transport: http(env.EVM_RPC_URL) });
      return tokensPlugin({ publicClient });
    }

    case "trading-policy": {
      const { tradingPolicyRules } = await import("@thiny/plugin-trading-policy");
      const { policyMiddleware } = await import("@thiny/core");
      const allowedAssets = (env.ALLOWED_ASSETS ?? "").split(",").filter(Boolean);
      return {
        name: "trading-policy",
        toolMiddleware: [
          policyMiddleware(
            tradingPolicyRules({
              allowedAssets,
              maxPositionSize: BigInt(env.MAX_POSITION_SIZE ?? "1000000"),
              maxSlippageBps: Number(env.MAX_SLIPPAGE_BPS ?? "100"),
            }),
          ),
        ],
      };
    }

    case "knowledge": {
      const { knowledgePlugin } = await import("@thiny/plugin-knowledge");
      // Placeholder embedder — replace with a real one (openai, ollama) for production
      const embedder = (texts: string[]): Promise<number[][]> =>
        Promise.resolve(texts.map(() => Array.from({ length: 4 }, () => Math.random())));
      return knowledgePlugin({ embedder });
    }

    case "resilience": {
      const { retry, timeout, toolCache } = await import("@thiny/plugin-resilience");
      return {
        name: "resilience",
        toolMiddleware: [retry({ retries: 2, baseDelayMs: 500 }), timeout(30_000), toolCache()],
      };
    }

    case "mcp": {
      const { mcpPlugin } = await import("@thiny/mcp");
      const command = env.MCP_COMMAND ?? "npx";
      const args = (env.MCP_ARGS ?? "").split(" ").filter(Boolean);
      return mcpPlugin({ command, args, name: env.MCP_NAME ?? "mcp" });
    }

    case "agent-skills": {
      const { agentSkillsPlugin } = await import("@thiny/plugin-agent-skills");
      return agentSkillsPlugin({ cwd: process.cwd(), injectContext: true });
    }

    default:
      return null; // Unknown skill IDs are caught by checkEnv() before reaching here
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
