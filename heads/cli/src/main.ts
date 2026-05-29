/**
 * Thiny CLI head — an interactive terminal agent.
 *
 * Provider is resolved automatically from environment / thiny.config.json.
 * Zero code changes needed to switch models or providers.
 *
 * Usage:
 *   pnpm cli
 *   THINY_MODEL=anthropic:claude-haiku-4-5-20251001 pnpm cli
 *   THINY_MODEL=openai-compat:llama3 THINY_OPENAI_BASE_URL=http://localhost:11434/v1 pnpm cli
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { z } from "zod";
import {
  createAgent,
  defineTool,
  modelAuditMiddleware,
  toolAuditMiddleware,
  budgetMiddleware,
} from "@thiny/core";
import { loadThinyConfig } from "@thiny/model-aisdk";
import { pinoLogger } from "@thiny/logger-pino";
import { webSearchPlugin } from "@thiny/plugin-web-search";

const echoTool = defineTool({
  name: "echo",
  description: "Echo text back verbatim. Use when asked to repeat or echo something.",
  parameters: z.object({ text: z.string().describe("the text to echo") }),
  execute: ({ text }) => Promise.resolve({ echoed: text }),
});

async function main() {
  const logger = pinoLogger({
    level: process.env.LOG_LEVEL ?? "info",
    // Write structured audit log to file when AUDIT_LOG is set, e.g. AUDIT_LOG=audit.log
    file: process.env.AUDIT_LOG,
  });

  // Resolve the active model name the same way loadThinyConfig() does,
  // so the startup banner shows what is actually being used.
  const activeModelName =
    process.env.THINY_MODEL ?? process.env.AGENT_MODEL ?? "openai:gpt-4o-mini";
  const model = loadThinyConfig();

  const plugins = [];
  if (process.env.BRAVE_API_KEY) {
    plugins.push(webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY }));
  }

  const agent = await createAgent({
    model,
    logger,
    systemPrompt:
      "You are a helpful CLI assistant. Use tools when they help you answer better. " +
      "Be concise.",
    tools: [echoTool],
    plugins: [
      {
        name: "observability",
        modelMiddleware: [
          modelAuditMiddleware(logger),
          budgetMiddleware({ maxCalls: 50, maxTokens: 500_000 }),
        ],
        toolMiddleware: [toolAuditMiddleware(logger)],
      },
      ...plugins,
    ],
  });

  const rl = createInterface({ input: stdin, output: stdout });
  stdout.write(`Thiny agent ready  [model: ${activeModelName}]\n`);
  stdout.write("Type a message and press Enter. Ctrl+C to quit.\n\n");

  for (;;) {
    const input = await rl.question("> ");
    if (!input.trim()) continue;

    try {
      await agent.run(input, {
        sessionId: "cli",
        onToken: (delta) => {
          process.stdout.write(delta);
        },
      });
      stdout.write("\n");
    } catch (err: unknown) {
      stdout.write(`\nerror: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
