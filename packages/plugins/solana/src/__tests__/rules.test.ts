import { describe, it, expect } from "vitest";
import { z } from "zod";
import { solanaTransferRules } from "../rules.js";
import { defineTool, type Ctx, type PolicyRule } from "@thiny/core";

const sendTool = defineTool({
  name: "solana_send_sol",
  description: "",
  sensitive: true,
  parameters: z.object({ to: z.string(), lamports: z.string() }),
  execute: async () => "sig",
});

const ctx = {} as unknown as Ctx;
const rules = solanaTransferRules({ maxLamports: 1_000_000n, allowlist: ["RecipientPubkey"] });

/** Safe helper — the rules array is always non-empty. */
function firstRule(): PolicyRule {
  const rule = rules[0];
  if (!rule) throw new Error("rules array is empty");
  return rule;
}

describe("solanaTransferRules", () => {
  it("denies when lamports exceed the cap", () => {
    const d = firstRule()({
      tool: sendTool,
      args: { to: "RecipientPubkey", lamports: "9999999" },
      ctx,
    });
    expect(d).toMatchObject({ effect: "deny" });
  });

  it("denies when destination is not on the allowlist", () => {
    const d = firstRule()({ tool: sendTool, args: { to: "BadActor", lamports: "100" }, ctx });
    expect(d).toMatchObject({ effect: "deny" });
  });

  it("requires approval for an in-policy send", () => {
    const d = firstRule()({
      tool: sendTool,
      args: { to: "RecipientPubkey", lamports: "100" },
      ctx,
    });
    expect(d).toMatchObject({ effect: "approve" });
  });

  it("abstains for non-send tools", () => {
    const other = { ...sendTool, name: "solana_get_balance" };
    expect(firstRule()({ tool: other, args: {}, ctx })).toBeNull();
  });
});
