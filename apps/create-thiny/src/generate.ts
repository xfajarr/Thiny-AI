/** A file to be written to the scaffolded project. */
export interface GeneratedFile {
  path: string;
  contents: string;
}

/** Options passed to the scaffolding functions. */
export interface ScaffoldOptions {
  /** The project name (also used as the npm package name). */
  name: string;
  /** Plugin identifiers to include. Valid values: "web-search", "evm", "solana". */
  plugins: string[];
}

/** Metadata for each supported plugin. */
interface PluginMeta {
  /** npm package name */
  pkg: string;
  /** Import statement line */
  importLine: string;
  /** Plugin factory call (used inside createAgent plugins array) */
  setup: string;
}

const SUPPORTED_PLUGINS: Record<string, PluginMeta> = {
  "web-search": {
    pkg: "@thiny/plugin-web-search",
    importLine: 'import { webSearchPlugin } from "@thiny/plugin-web-search";',
    setup: `...(process.env.BRAVE_API_KEY
      ? [webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY })]
      : [])`,
  },
  evm: {
    pkg: "@thiny/plugin-evm",
    importLine: 'import { evmPlugin } from "@thiny/plugin-evm";',
    setup: `...(process.env.EVM_RPC_URL
      ? [evmPlugin({ rpcUrl: process.env.EVM_RPC_URL, isTestnet: true })]
      : [])`,
  },
  solana: {
    pkg: "@thiny/plugin-solana",
    importLine: 'import { solanaPlugin } from "@thiny/plugin-solana";',
    setup: "solanaPlugin()",
  },
};

/**
 * Look up a plugin's metadata. Returns undefined for unknown plugin ids.
 * Callers must filter by `p in SUPPORTED_PLUGINS` before calling this.
 */
function getPluginMeta(id: string): PluginMeta | undefined {
  return SUPPORTED_PLUGINS[id];
}

/**
 * Render the main `src/agent.ts` entrypoint for the scaffolded project.
 */
export function renderAgentFile(opts: ScaffoldOptions): string {
  const validPlugins = opts.plugins.filter((p) => p in SUPPORTED_PLUGINS);
  const imports = validPlugins
    .map((p) => getPluginMeta(p)?.importLine ?? "")
    .filter(Boolean)
    .join("\n");
  const pluginSetups = validPlugins
    .map((p) => `    ${getPluginMeta(p)?.setup ?? ""}`)
    .filter((s) => s.trim())
    .join(",\n");

  return `import { createAgent, pinoLogger, defineTool, budgetMiddleware, modelAuditMiddleware, toolAuditMiddleware } from "@thiny/agent";
import { loadThinyConfig } from "@thiny/model-aisdk";
import { sqliteMemory } from "@thiny/memory-sqlite";
import { z } from "zod";
${imports ? imports + "\n" : ""}
async function main(): Promise<void> {
  const logger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info" });

  const agent = await createAgent({
    model: loadThinyConfig(),
    logger,
    memory: await sqliteMemory({ url: process.env.SESSION_DB ?? "file:agent.sqlite" }),
    systemPrompt: "You are ${opts.name}, a helpful AI assistant.",
    tools: [
      defineTool({
        name: "echo",
        description: "Echo text back verbatim.",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }) => ({ echoed: text }),
      }),
    ],
    plugins: [
      {
        name: "safety",
        modelMiddleware: [modelAuditMiddleware(logger), budgetMiddleware({ maxCalls: 20, maxTokens: 100_000, logger })],
        toolMiddleware: [toolAuditMiddleware(logger)],
      },
${pluginSetups ? pluginSetups + ",\n" : ""}    ],
  });

  const input = process.argv[2];
  if (!input) {
    console.error("Usage: pnpm agent \\"your message\\"");
    process.exit(1);
  }

  const reply = await agent.run(input, { sessionId: "default" });
  console.log(reply);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
`;
}

/**
 * Generate the complete set of files for a new Thiny agent project.
 */
export function planFiles(opts: ScaffoldOptions): GeneratedFile[] {
  const validPlugins = opts.plugins.filter((p) => p in SUPPORTED_PLUGINS);
  const pluginDeps = Object.fromEntries(
    validPlugins.flatMap((p) => {
      const meta = getPluginMeta(p);
      return meta ? [[meta.pkg, "*"]] : [];
    }),
  );

  return [
    {
      path: "package.json",
      contents: JSON.stringify(
        {
          name: opts.name,
          version: "0.1.0",
          type: "module",
          scripts: {
            agent: "node --env-file=.env --import tsx src/agent.ts",
          },
          dependencies: {
            "@thiny/agent": "*",
            "@thiny/model-aisdk": "*",
            "@thiny/memory-sqlite": "*",
            zod: "^3",
            tsx: "^4",
            ...pluginDeps,
          },
        },
        null,
        2,
      ),
    },
    {
      path: "src/agent.ts",
      contents: renderAgentFile(opts),
    },
    {
      path: "thiny.config.json",
      contents: JSON.stringify(
        {
          model: "openai:gpt-4o-mini",
          openai: { apiKey: "env:OPENAI_API_KEY" },
        },
        null,
        2,
      ),
    },
    {
      path: ".env.example",
      contents: [
        "# Model",
        "OPENAI_API_KEY=sk-...",
        "",
        "# Session storage",
        "SESSION_DB=file:agent.sqlite",
        "",
        "# Optional features",
        ...(validPlugins.includes("web-search")
          ? ["BRAVE_API_KEY=   # enables web_search tool"]
          : []),
        ...(validPlugins.includes("evm")
          ? ["EVM_RPC_URL=https://sepolia.infura.io/v3/<key>  # Sepolia testnet"]
          : []),
        "",
        "LOG_LEVEL=info",
      ].join("\n"),
    },
  ];
}
