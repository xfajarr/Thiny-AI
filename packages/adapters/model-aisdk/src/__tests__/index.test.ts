import { describe, it, expect } from "vitest";
import type { LanguageModel } from "ai";
import { aiSdkModel } from "../index.js";

describe("aiSdkModel — model string resolution", () => {
  it("accepts a pre-built LanguageModel instance without resolving", () => {
    const fakeModel = {} as unknown as LanguageModel;
    expect(() => aiSdkModel({ model: fakeModel })).not.toThrow();
  });

  it("resolves openai:model-id with default settings", () => {
    expect(() => aiSdkModel({ model: "openai:gpt-4o-mini" })).not.toThrow();
  });

  it("resolves openai:model-id with a custom baseURL (OpenAI-compatible provider)", () => {
    expect(() =>
      aiSdkModel({
        model: "openai:llama3",
        openai: { baseURL: "http://localhost:11434/v1", apiKey: "ollama" },
      }),
    ).not.toThrow();
  });

  it("resolves openai-compat:model-id with a custom baseURL", () => {
    expect(() =>
      aiSdkModel({
        model: "openai-compat:mixtral-8x7b",
        openai: { baseURL: "https://api.together.xyz/v1", apiKey: "test-key" },
      }),
    ).not.toThrow();
  });

  it("resolves anthropic:model-id with default settings", () => {
    expect(() => aiSdkModel({ model: "anthropic:claude-haiku-4-5-20251001" })).not.toThrow();
  });

  it("resolves anthropic:model-id with a custom baseURL (proxy / compatible backend)", () => {
    expect(() =>
      aiSdkModel({
        model: "anthropic:claude-3-5-haiku-20241022",
        anthropic: { baseURL: "https://my-proxy.example.com", apiKey: "proxy-key" },
      }),
    ).not.toThrow();
  });

  it("throws a clear error for an unknown provider", () => {
    expect(() => aiSdkModel({ model: "groq:llama3" })).toThrow(/unknown provider "groq"/);
  });

  it("throws a clear error for a malformed model string (no colon)", () => {
    expect(() => aiSdkModel({ model: "gpt-4o-mini" })).toThrow(/invalid model string/);
  });
});
