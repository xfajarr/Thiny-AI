import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { loadThinyConfig } from "../config.js";

const TMP = resolve(process.cwd(), "__thiny_test_config__.json");

beforeEach(() => {
  try {
    unlinkSync(TMP);
  } catch {
    /* ignore */
  }
});
afterEach(() => {
  try {
    unlinkSync(TMP);
  } catch {
    /* ignore */
  }
});

describe("loadThinyConfig", () => {
  it("returns a provider when no config file exists (falls back to env defaults)", () => {
    expect(() => loadThinyConfig("/non/existent/thiny.config.json")).not.toThrow();
  });

  it("reads model from config file", () => {
    writeFileSync(TMP, JSON.stringify({ model: "openai:gpt-4o-mini" }));
    expect(() => loadThinyConfig(TMP)).not.toThrow();
  });

  it("resolves env: references in apiKey", () => {
    process.env._THINY_TEST_KEY = "resolved-key";
    writeFileSync(
      TMP,
      JSON.stringify({
        model: "openai:gpt-4o-mini",
        openai: { apiKey: "env:_THINY_TEST_KEY" },
      }),
    );
    expect(() => loadThinyConfig(TMP)).not.toThrow();
    delete process.env._THINY_TEST_KEY;
  });

  it("env var THINY_MODEL overrides config file model", () => {
    writeFileSync(TMP, JSON.stringify({ model: "anthropic:claude-haiku-4-5-20251001" }));
    process.env.THINY_MODEL = "openai:gpt-4o";
    expect(() => loadThinyConfig(TMP)).not.toThrow();
    delete process.env.THINY_MODEL;
  });

  it("throws a clear error for malformed JSON", () => {
    writeFileSync(TMP, "{ invalid json }");
    expect(() => loadThinyConfig(TMP)).toThrow(/failed to parse/i);
  });
});
