/**
 * Thiny daemon head — runs an agent autonomously on a heartbeat schedule.
 *
 * Uses @thiny/runtime for interval/cron scheduling with:
 * - No-overlap guard (a job in flight is not retriggered)
 * - maxRuns kill switch (controlled via MAX_RUNS env var)
 * - Graceful SIGINT/SIGTERM shutdown
 *
 * Usage:
 *   pnpm daemon
 *   HEARTBEAT_MS=30000 MAX_RUNS=50 pnpm daemon
 */
import { createAgent, denyApprover } from "@thiny/core";
import { loadThinyConfig } from "@thiny/model-aisdk";
import { pinoLogger } from "@thiny/logger-pino";
import { sqliteMemory } from "@thiny/memory-sqlite";
import { Runtime } from "@thiny/runtime";

async function main(): Promise<void> {
  const logger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info" });

  const agent = await createAgent({
    model: loadThinyConfig(),
    logger,
    memory: await sqliteMemory({ url: process.env.SESSION_DB ?? "file:thiny.sqlite" }),
    systemPrompt:
      "You are an autonomous agent. On each heartbeat, evaluate the current situation " +
      "and act if necessary. If nothing needs doing, reply with DONE.",
    // Headless: deny all sensitive tool calls by default.
    // Override per deployment with autoApprover([...]) for specific tools.
    approver: denyApprover,
  });

  const heartbeatMs = Number(process.env.HEARTBEAT_MS ?? 60_000);
  const maxRuns = process.env.MAX_RUNS ? Number(process.env.MAX_RUNS) : undefined;

  const runtime = new Runtime({
    agent,
    logger,
    jobs: [
      {
        name: "heartbeat",
        trigger: { kind: "interval", ms: heartbeatMs },
        input:
          process.env.HEARTBEAT_INPUT ??
          "Heartbeat tick. Evaluate the current situation and act if needed.",
        maxRuns,
      },
    ],
  });

  runtime.start();

  logger.info(
    {
      event: "daemon_ready",
      heartbeatMs,
      maxRuns: maxRuns ?? "unlimited",
    },
    `Daemon ready — heartbeat every ${String(heartbeatMs)}ms`,
  );

  const shutdown = async (): Promise<void> => {
    logger.info({ event: "daemon_shutdown" }, "Shutting down daemon…");
    await runtime.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
