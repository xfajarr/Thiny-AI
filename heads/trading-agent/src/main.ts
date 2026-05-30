/**
 * Thiny trading agent — autonomous DeFi strategy runner.
 *
 * Runs on a heartbeat schedule with market_price + portfolio tracking.
 * ALL sensitive operations (swaps, approvals) are gated by trading policy rules.
 * Paper-test with `pnpm vitest run heads/trading-agent/src/paper.test.ts` before live use.
 *
 * Usage:
 *   pnpm trading-agent
 *   HEARTBEAT_MS=30000 MAX_RUNS=10 pnpm trading-agent
 */
import {
  createAgent,
  autoApprover,
  policyMiddleware,
  modelAuditMiddleware,
  toolAuditMiddleware,
  budgetMiddleware,
} from "@thiny/core";
import { loadThinyConfig } from "@thiny/model-aisdk";
import { pinoLogger } from "@thiny/logger-pino";
import { sqliteMemory } from "@thiny/memory-sqlite";
import { marketPlugin } from "@thiny/plugin-market";
import { tradingPolicyRules } from "@thiny/plugin-trading-policy";
import { Runtime } from "@thiny/runtime";
import { SYSTEM_PROMPT, HEARTBEAT_INPUT } from "./strategy.js";

async function main(): Promise<void> {
  const logger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info" });

  const allowedAssets = (process.env.ALLOWED_ASSETS ?? "").split(",").filter(Boolean);
  const maxPositionSize = BigInt(process.env.MAX_POSITION_SIZE ?? "1000000");
  const maxSlippageBps = Number(process.env.MAX_SLIPPAGE_BPS ?? "100");

  if (allowedAssets.length === 0) {
    logger.warn(
      { event: "config_warning" },
      "ALLOWED_ASSETS not set — all swaps will be denied by policy",
    );
  }

  const agent = await createAgent({
    model: loadThinyConfig(),
    logger,
    memory: await sqliteMemory({ url: process.env.SESSION_DB ?? "file:trading-agent.sqlite" }),
    systemPrompt: SYSTEM_PROMPT,
    // Headless: only allow swap_execute explicitly — everything else denied
    approver: autoApprover(["swap_execute", "sol_swap_execute"]),
    plugins: [
      marketPlugin(),
      {
        name: "safety",
        modelMiddleware: [
          modelAuditMiddleware(logger),
          budgetMiddleware({ maxCalls: 10, maxTokens: 50_000, logger }),
        ],
        toolMiddleware: [
          toolAuditMiddleware(logger),
          policyMiddleware(tradingPolicyRules({ allowedAssets, maxPositionSize, maxSlippageBps })),
        ],
      },
    ],
  });

  const heartbeatMs = Number(process.env.HEARTBEAT_MS ?? 60_000);
  const maxRuns = process.env.MAX_RUNS ? Number(process.env.MAX_RUNS) : undefined;

  const runtime = new Runtime({
    agent,
    logger,
    jobs: [
      {
        name: "strategy-heartbeat",
        trigger: { kind: "interval", ms: heartbeatMs },
        input: HEARTBEAT_INPUT,
        maxRuns,
      },
    ],
  });

  runtime.start();
  logger.info(
    { event: "trading_agent_ready", heartbeatMs, maxRuns: maxRuns ?? "unlimited", allowedAssets },
    "Trading agent running — paper-test first with pnpm vitest run heads/trading-agent/src/paper.test.ts",
  );

  const shutdown = (): void => {
    void (async () => {
      await runtime.stop();
      process.exit(0);
    })();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
