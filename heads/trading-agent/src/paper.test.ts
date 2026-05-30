/**
 * Paper-trade eval tests — fully offline, zero API calls, zero test ETH.
 *
 * Run these BEFORE pointing the trading agent at a real testnet to verify
 * the strategy logic, tool call sequencing, and policy gate behaviour.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createAgent, defineTool, policyMiddleware, autoApprover, denyApprover } from "@thiny/core";
import { scriptModel, runEval } from "@thiny/eval";
import type { Logger } from "@thiny/core";
import { tradingPolicyRules } from "@thiny/plugin-trading-policy";
import { SYSTEM_PROMPT, HEARTBEAT_INPUT } from "./strategy.js";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (): void => {};
const silentLogger: Logger = {
  info: noop,
  warn: noop,
  error: noop,
  child() {
    return silentLogger;
  },
};

const priceTool = defineTool({
  name: "market_price",
  description: "",
  parameters: z.object({ ids: z.array(z.string()), currency: z.string().optional() }),
  execute: async () => ({ prices: { ethereum: 3200, "usd-coin": 1 }, currency: "usd" }),
});
const portfolioGetTool = defineTool({
  name: "portfolio_get",
  description: "",
  parameters: z.object({}),
  execute: async () => ({ positions: [] }),
});

describe("trading agent paper-trade scenarios", () => {
  it("checks price and portfolio before deciding to act", async () => {
    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [
            { id: "1", name: "market_price", args: { ids: ["ethereum", "usd-coin"] } },
            { id: "2", name: "portfolio_get", args: {} },
          ],
        },
        { finishReason: "stop", text: "Prices look stable. No action needed. DONE" },
      ]),
      logger: silentLogger,
      systemPrompt: SYSTEM_PROMPT,
      tools: [priceTool, portfolioGetTool],
    });

    const results = await runEval(agent, [
      {
        name: "price-check-before-act",
        input: HEARTBEAT_INPUT,
        expectToolCalls: ["market_price", "portfolio_get"],
        expectFinal: /DONE/,
      },
    ]);
    expect(results[0]?.passed).toBe(true);
  });

  it("blocks a swap that exceeds position size", async () => {
    const swapTool = defineTool({
      name: "swap_execute",
      description: "",
      sensitive: true,
      parameters: z.object({
        tokenIn: z.string(),
        tokenOut: z.string(),
        amountIn: z.string(),
        minAmountOut: z.string(),
      }),
      execute: async () => "0xhash",
    });

    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: "1",
              name: "swap_execute",
              args: {
                tokenIn: "0xUsdc",
                tokenOut: "0xWeth",
                amountIn: "9999999",
                minAmountOut: "9899999",
              },
            },
          ],
        },
        { finishReason: "stop", text: "Swap was denied by policy due to position size limit." },
      ]),
      logger: silentLogger,
      systemPrompt: SYSTEM_PROMPT,
      tools: [swapTool],
      plugins: [
        {
          name: "policy",
          toolMiddleware: [
            policyMiddleware(
              tradingPolicyRules({
                allowedAssets: ["0xUsdc", "0xWeth"],
                maxPositionSize: 1_000_000n,
                maxSlippageBps: 100,
              }),
            ),
          ],
        },
      ],
      approver: denyApprover,
    });

    const results = await runEval(agent, [
      {
        name: "position-size-blocked",
        input: HEARTBEAT_INPUT,
        expectFinal: /denied|policy|limit/i,
      },
    ]);
    expect(results[0]?.passed).toBe(true);
  });

  it("approves an in-policy swap via autoApprover", async () => {
    const swapTool = defineTool({
      name: "swap_execute",
      description: "",
      sensitive: true,
      parameters: z.object({
        tokenIn: z.string(),
        tokenOut: z.string(),
        amountIn: z.string(),
        minAmountOut: z.string(),
      }),
      execute: async ({ tokenIn, tokenOut, amountIn }) => ({
        hash: "0xfakehash",
        tokenIn,
        tokenOut,
        amountIn,
      }),
    });

    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: "1",
              name: "swap_execute",
              args: { tokenIn: "0xUsdc", tokenOut: "0xWeth", amountIn: "100", minAmountOut: "99" },
            },
          ],
        },
        { finishReason: "stop", text: "Swap executed. Hash: 0xfakehash. DONE" },
      ]),
      logger: silentLogger,
      systemPrompt: SYSTEM_PROMPT,
      tools: [swapTool],
      plugins: [
        {
          name: "policy",
          toolMiddleware: [
            policyMiddleware(
              tradingPolicyRules({
                allowedAssets: ["0xUsdc", "0xWeth"],
                maxPositionSize: 1_000_000n,
                maxSlippageBps: 100,
              }),
            ),
          ],
        },
      ],
      approver: autoApprover(["swap_execute"]),
    });

    const results = await runEval(agent, [
      {
        name: "approved-swap",
        input: HEARTBEAT_INPUT,
        expectToolCalls: ["swap_execute"],
        expectFinal: /0xfakehash/,
      },
    ]);
    expect(results[0]?.passed).toBe(true);
  });
});
