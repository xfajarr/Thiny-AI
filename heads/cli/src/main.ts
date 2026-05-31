/**
 * Thiny CLI — beautiful TUI with skills support.
 *
 * Usage:
 *   pnpm cli
 *   pnpm cli --skills web-search,evm
 *   THINY_PERSONA_NAME=ThinyAI pnpm cli
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
import { loadThinyConfig, readThinyConfig } from "@thiny/model-aisdk";
import { pinoLogger } from "@thiny/logger-pino";
import { sqliteMemory } from "@thiny/memory-sqlite";
import { defaultRegistry } from "@thiny/skills";
import { loadSkills } from "./skills.js";
import {
  clearScreen,
  renderHeader,
  renderToolsAndSkills,
  renderHints,
  renderUserMessage,
  renderAgentLabel,
  renderAgentDone,
  renderError,
  renderInfo,
  renderWarning,
  Spinner,
} from "./ui.js";

const echoTool = defineTool({
  name: "echo",
  description: "Echo text back verbatim. Use when asked to repeat or echo something.",
  parameters: z.object({ text: z.string().describe("the text to echo") }),
  execute: ({ text }) => Promise.resolve({ echoed: text }),
});

function parseSkillArgs(): string[] {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--skills");
  if (idx === -1) return [];
  return (args[idx + 1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

let currentSessionId = `cli-${new Date().getTime().toString()}`;

async function main(): Promise<void> {
  // In TUI mode, write all logs to a file so they never appear in the terminal.
  // Both stdout and stderr map to the same TTY, so only a file truly hides them.
  // Inspect logs with: tail -f ~/.thiny/cli.log
  const logFile = process.env.THINY_LOG_FILE ?? `${process.env.HOME ?? "."}/thiny-cli.log`;
  const logger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info", file: logFile });

  const activeModelName =
    process.env.THINY_MODEL ?? process.env.AGENT_MODEL ?? "openai:gpt-4o-mini";
  const personaName = process.env.THINY_PERSONA_NAME ?? "Thiny";
  const model = loadThinyConfig();

  const memory = await sqliteMemory({ url: process.env.SESSION_DB ?? "file:thiny.sqlite" });

  // Skills: merge thiny.config.json "skills" array with CLI --skills flag.

  const configSkills: string[] = readThinyConfig().skills ?? [];

  const cliSkills = parseSkillArgs();
  const requestedSkillIds = [...new Set([...configSkills, ...cliSkills])];
  const { plugins: skillPlugins, warnings: skillWarnings } = await loadSkills(
    requestedSkillIds,
    process.env,
  );

  const persona = process.env.THINY_PERSONA_NAME
    ? { name: process.env.THINY_PERSONA_NAME, description: process.env.THINY_PERSONA_DESCRIPTION }
    : undefined;

  // Create budget middleware separately so we can reset it per turn.
  // budgetMiddleware counters accumulate across calls — without reset() every
  // subsequent turn in the REPL would count toward the same cap.
  const budget = budgetMiddleware({ maxCalls: 50, logger });

  const agent = await createAgent({
    model,
    logger,
    memory,
    persona,
    systemPrompt:
      "You are a helpful AI assistant. Use tools when they help you answer better. Be concise.",
    tools: [echoTool],
    plugins: [
      {
        name: "observability",
        modelMiddleware: [modelAuditMiddleware(logger), budget],
        toolMiddleware: [toolAuditMiddleware(logger)],
      },
      ...skillPlugins,
    ],
  });

  // Startup TUI
  clearScreen();
  renderHeader({
    model: activeModelName,
    session: currentSessionId,
    persona: personaName,
    version: "v0.1.0",
  });

  const registeredTools = agent.registry
    .all()
    .map((t) => t.name)
    .filter((name) => name !== "echo");

  // Build skills display: loaded skills → their tools; or show all available
  const skillsByCategory = new Map<string, string[]>();
  if (requestedSkillIds.length > 0) {
    for (const id of requestedSkillIds) {
      const def = defaultRegistry.all().find((s) => s.id === id);
      if (!def) continue;
      const existing = skillsByCategory.get(def.category) ?? [];
      existing.push(def.id);
      skillsByCategory.set(def.category, existing);
    }
  } else {
    for (const [cat, defs] of defaultRegistry.byCategory()) {
      skillsByCategory.set(
        cat,
        defs.map((d) => d.id),
      );
    }
  }

  renderToolsAndSkills(registeredTools, skillsByCategory, {
    model: activeModelName,
    session: currentSessionId,
    persona: personaName,
  });
  renderHints(logFile);
  for (const w of skillWarnings) renderWarning(w);

  // REPL
  const rl = createInterface({ input: stdin, output: stdout });
  const spinner = new Spinner();

  for (;;) {
    const input = await rl.question("\x1b[36mYou\x1b[0m \x1b[2m›\x1b[0m ");
    const trimmed = input.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("/")) {
      const parts = trimmed.slice(1).split(" ");
      const cmd = parts[0];
      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
      switch (cmd) {
        case "new":
          currentSessionId = `cli-${new Date().getTime().toString()}`;
          renderInfo("New session started");
          break;
        case "tools":
          renderInfo(
            `\nTools:\n${agent.registry
              .all()
              .map((t) => `  • ${t.name}  ${t.description.slice(0, 55)}`)
              .join("\n")}\n`,
          );
          break;
        case "skills":
          renderInfo("\nAvailable skills:");
          for (const [cat, defs] of defaultRegistry.byCategory()) {
            renderInfo(`  [${cat}]  ${defs.map((d) => d.id).join(", ")}`);
          }
          renderInfo("");
          break;
        case "session":
          renderInfo(`Session: ${currentSessionId}`);
          break;
        case "clear":
          clearScreen();
          renderHeader({ model: activeModelName, session: currentSessionId, persona: personaName });
          renderToolsAndSkills(registeredTools, skillsByCategory, {
            model: activeModelName,
            session: currentSessionId,
            persona: personaName,
          });
          renderHints(logFile);
          break;
        case "help":
          renderInfo("\n/new · /tools · /skills · /session · /clear · /help\n");
          break;
        default:
          renderWarning(`Unknown command: /${cmd ?? ""}  — try /help`);
      }
      continue;
    }

    renderUserMessage(trimmed);
    renderAgentLabel(personaName);
    spinner.start("thinking…");

    budget.reset(); // reset per-turn counters before each run

    try {
      let firstToken = true;
      const toolHandler = (payload: unknown): void => {
        const { call } = payload as { call: { name: string } };
        spinner.stop();
        stdout.write(`  \x1b[33m⚙\x1b[0m \x1b[2m${call.name}\x1b[0m\n`);
        spinner.start("running…");
      };
      agent.events.on("beforeToolCall", toolHandler);

      const reply = await agent.run(trimmed, {
        sessionId: currentSessionId,
        onToken: (delta) => {
          if (firstToken) {
            spinner.stop();
            firstToken = false;
          }
          stdout.write(delta);
        },
      });

      agent.events.off("beforeToolCall", toolHandler);
      spinner.stop();

      // If streaming emitted no tokens but agent returned text (non-streaming fallback),
      // print it now. Also handle the case where model returned genuinely empty text.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (firstToken) {
        // Streaming emitted no tokens — print reply from blocking generate() fallback,
        // or show a notice if the model returned nothing.

        stdout.write(reply || "\x1b[2m(model returned empty response)\x1b[0m");
      }

      renderAgentDone();
    } catch (err: unknown) {
      spinner.stop();
      renderError(err instanceof Error ? err.message : String(err));
    }
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
