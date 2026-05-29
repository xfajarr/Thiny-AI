import { describe, it, expect } from "vitest";
import { z } from "zod";
import { evmTransferRules } from "../rules.js";
import { defineTool, type Ctx } from "@thiny/core";

const sendTool = defineTool({
  name: "evm_send_native",
  description: "",
  sensitive: true,
  parameters: z.object({ to: z.string(), valueWei: z.string() }),
  execute: async () => "0xhash",
});

const ctx = {} as unknown as Ctx;
const rules = evmTransferRules({ maxValueWei: 1_000_000n, allowlist: ["0xAllowed"] });

describe("evmTransferRules", () => {
  it("denies when value exceeds the cap", () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const d = rules[0]!({ tool: sendTool, args: { to: "0xAllowed", valueWei: "9999999" }, ctx });
    expect(d).toMatchObject({ effect: "deny" });
  });

  it("denies when destination is not on the allowlist", () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const d = rules[0]!({ tool: sendTool, args: { to: "0xBad", valueWei: "100" }, ctx });
    expect(d).toMatchObject({ effect: "deny" });
  });

  it("requires approval for an in-policy send", () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const d = rules[0]!({ tool: sendTool, args: { to: "0xAllowed", valueWei: "100" }, ctx });
    expect(d).toMatchObject({ effect: "approve" });
  });

  it("abstains (returns null) for non-send tools", () => {
    const other = { ...sendTool, name: "evm_get_balance" };
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(rules[0]!({ tool: other, args: {}, ctx })).toBeNull();
  });
});
