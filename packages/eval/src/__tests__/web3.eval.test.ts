/**
 * Web3 integration eval scenarios.
 *
 * These tests confirm that the full stack (agent → policy → tool → approval)
 * composes correctly for on-chain use cases.
 *
 * All tests are fully offline — no network calls, no real keys, no test ETH.
 * Uses scriptModel + fake tools.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createAgent, defineTool, policyMiddleware, denyApprover, autoApprover } from "@thiny/core";
import { scriptModel, runEval } from "../index.js";
import type { Logger } from "@thiny/core";

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

describe("Web3 eval scenarios", () => {
  it("read-only tool executes without approval", async () => {
    const balanceTool = defineTool({
      name: "evm_get_balance",
      description: "Get ETH balance",
      parameters: z.object({ address: z.string() }),
      execute: async () => ({ wei: "1000000000000000000", eth: "1.0" }),
    });

    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [{ id: "1", name: "evm_get_balance", args: { address: "0xabc" } }],
        },
        { finishReason: "stop", text: "The balance is 1.0 ETH." },
      ]),
      logger: silentLogger,
      tools: [balanceTool],
      plugins: [{ name: "policy", toolMiddleware: [policyMiddleware([])] }],
      approver: denyApprover,
    });

    const results = await runEval(agent, [
      {
        name: "balance-read",
        input: "check balance of 0xabc",
        expectToolCalls: ["evm_get_balance"],
        expectFinal: /1\.0 ETH/,
      },
    ]);

    expect(results[0]?.passed).toBe(true);
    expect(results[0]?.reasons).toHaveLength(0);
  });

  it("sensitive tool is blocked when no approver is configured", async () => {
    const sendTool = defineTool({
      name: "evm_send_native",
      description: "Send ETH",
      sensitive: true,
      parameters: z.object({ to: z.string(), valueWei: z.string() }),
      execute: async () => "0xhash",
    });

    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [
            { id: "1", name: "evm_send_native", args: { to: "0xBad", valueWei: "9999999999" } },
          ],
        },
        { finishReason: "stop", text: "The send was denied by policy." },
      ]),
      logger: silentLogger,
      tools: [sendTool],
      plugins: [{ name: "policy", toolMiddleware: [policyMiddleware([])] }],
      // No approver — policy defaults to "approve" for sensitive tools,
      // but without an approver configured the approval is automatically denied.
    });

    const results = await runEval(agent, [
      {
        name: "send-blocked",
        input: "send all ETH",
        expectFinal: /denied|blocked|policy/i,
      },
    ]);

    expect(results[0]?.passed).toBe(true);
  });

  it("in-policy sensitive tool executes when approver allows it", async () => {
    const sendTool = defineTool({
      name: "evm_send_native",
      description: "Send ETH",
      sensitive: true,
      parameters: z.object({ to: z.string(), valueWei: z.string() }),
      execute: async ({ to, valueWei }) => ({ hash: "0xfakehash", to, valueWei }),
    });

    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [
            { id: "1", name: "evm_send_native", args: { to: "0xRecipient", valueWei: "100" } },
          ],
        },
        { finishReason: "stop", text: "Sent 100 wei. Transaction hash: 0xfakehash" },
      ]),
      logger: silentLogger,
      tools: [sendTool],
      plugins: [{ name: "policy", toolMiddleware: [policyMiddleware([])] }],
      // Explicitly allow evm_send_native (simulates a developer-controlled headless approver)
      approver: autoApprover(["evm_send_native"]),
    });

    const results = await runEval(agent, [
      {
        name: "send-approved",
        input: "send 100 wei to 0xRecipient",
        expectToolCalls: ["evm_send_native"],
        expectFinal: /0xfakehash/,
      },
    ]);

    expect(results[0]?.passed).toBe(true);
  });

  it("Solana balance read executes without approval", async () => {
    const solanaTool = defineTool({
      name: "solana_get_balance",
      description: "Get SOL balance",
      parameters: z.object({ owner: z.string() }),
      execute: async () => ({ lamports: "1500000000", sol: 1.5 }),
    });

    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: "1",
              name: "solana_get_balance",
              args: { owner: "11111111111111111111111111111111" },
            },
          ],
        },
        { finishReason: "stop", text: "The balance is 1.5 SOL." },
      ]),
      logger: silentLogger,
      tools: [solanaTool],
      plugins: [{ name: "policy", toolMiddleware: [policyMiddleware([])] }],
      approver: denyApprover,
    });

    const results = await runEval(agent, [
      {
        name: "solana-balance",
        input: "check my Solana balance",
        expectToolCalls: ["solana_get_balance"],
        expectFinal: /1\.5 SOL/,
      },
    ]);

    expect(results[0]?.passed).toBe(true);
  });
});
