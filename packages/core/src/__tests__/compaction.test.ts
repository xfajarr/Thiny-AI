import { describe, it, expect, vi } from "vitest";
import { compactionMiddleware } from "../middleware/compaction.js";
import type { ModelProvider } from "../ports.js";
import type { Message, ModelResponse } from "../domain/messages.js";

describe("compactionMiddleware", () => {
  const mockSummarizer = (text: string): ModelProvider => ({
    generate: (): Promise<ModelResponse> => Promise.resolve({ text, finishReason: "stop" }),
  });

  it("does not compact when below maxMessages and maxTokens limits", async () => {
    const middleware = compactionMiddleware({
      maxMessages: 10,
      keepRecent: 2,
      summarizer: mockSummarizer("summary"),
    });

    const next = vi
      .fn()
      .mockImplementation((req) => Promise.resolve({ text: "ok", messages: req.messages }));

    const initialMessages: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];

    await middleware({ messages: initialMessages, tools: [] }, next);
    expect(next).toHaveBeenCalledWith({ messages: initialMessages, tools: [] });
  });

  it("compacts based on message count limit", async () => {
    const middleware = compactionMiddleware({
      maxMessages: 3,
      keepRecent: 1,
      summarizer: mockSummarizer("summary of past conversation"),
    });

    const next = vi
      .fn()
      .mockImplementation((req) => Promise.resolve({ text: "ok", messages: req.messages }));

    const initialMessages: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "how are you?" },
      { role: "assistant", content: "good" },
    ];

    await middleware({ messages: initialMessages, tools: [] }, next);

    expect(next).toHaveBeenCalled();
    const calledWith = next.mock.calls[0][0] as { messages: Message[] };

    expect(calledWith.messages).toHaveLength(3);
    expect(calledWith.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(calledWith.messages[1]).toEqual({
      role: "system",
      content: "[conversation summary]\nsummary of past conversation",
    });
    expect(calledWith.messages[2]).toEqual({ role: "assistant", content: "good" });
  });

  it("compacts based on estimated token limit", async () => {
    const middleware = compactionMiddleware({
      maxTokens: 50,
      keepRecent: 1,
      summarizer: mockSummarizer("compact summary"),
    });

    const next = vi
      .fn()
      .mockImplementation((req) => Promise.resolve({ text: "ok", messages: req.messages }));

    const initialMessages: Message[] = [
      { role: "system", content: "sys prompt" },
      { role: "user", content: "a".repeat(100) }, // ~29 tokens
      { role: "assistant", content: "b".repeat(100) }, // ~29 tokens
    ];

    await middleware({ messages: initialMessages, tools: [] }, next);

    expect(next).toHaveBeenCalled();
    const calledWith = next.mock.calls[0][0] as { messages: Message[] };

    expect(calledWith.messages).toHaveLength(3);
    expect(calledWith.messages[0]).toEqual({ role: "system", content: "sys prompt" });
    expect(calledWith.messages[1]).toEqual({
      role: "system",
      content: "[conversation summary]\ncompact summary",
    });
    expect(calledWith.messages[2]).toEqual({ role: "assistant", content: "b".repeat(100) });
  });

  it("handles empty message history gracefully", async () => {
    const middleware = compactionMiddleware({
      maxMessages: 3,
      keepRecent: 1,
      summarizer: mockSummarizer("empty"),
    });

    const next = vi
      .fn()
      .mockImplementation((req) => Promise.resolve({ text: "ok", messages: req.messages }));
    await middleware({ messages: [], tools: [] }, next);
    expect(next).toHaveBeenCalledWith({ messages: [], tools: [] });
  });

  it("handles messages with zero tokens/empty strings", async () => {
    const middleware = compactionMiddleware({
      maxTokens: 10,
      keepRecent: 1,
      summarizer: mockSummarizer("summary"),
    });

    const next = vi
      .fn()
      .mockImplementation((req) => Promise.resolve({ text: "ok", messages: req.messages }));
    const initialMessages: Message[] = [
      { role: "system", content: "" },
      { role: "user", content: "   " },
      { role: "assistant", content: "" },
    ];

    await middleware({ messages: initialMessages, tools: [] }, next);
    expect(next).toHaveBeenCalled();
    const calledWith = next.mock.calls[0][0] as { messages: Message[] };
    expect(calledWith.messages).toHaveLength(3);
  });

  it("handles keepRecent larger than total history gracefully by keeping all messages", async () => {
    const middleware = compactionMiddleware({
      maxMessages: 2,
      keepRecent: 10,
      summarizer: mockSummarizer("summary"),
    });

    const next = vi
      .fn()
      .mockImplementation((req) => Promise.resolve({ text: "ok", messages: req.messages }));
    const initialMessages: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
    ];

    await middleware({ messages: initialMessages, tools: [] }, next);
    expect(next).toHaveBeenCalledWith({ messages: initialMessages, tools: [] });
  });

  it("handles a single message that exceeds the maxTokens limit on its own", async () => {
    const middleware = compactionMiddleware({
      maxTokens: 5,
      keepRecent: 1,
      summarizer: mockSummarizer("summary of giant message"),
    });

    const next = vi
      .fn()
      .mockImplementation((req) => Promise.resolve({ text: "ok", messages: req.messages }));
    const initialMessages: Message[] = [
      { role: "system", content: "sys prompt" },
      { role: "user", content: "giant message content extremely long text".repeat(10) },
    ];

    await middleware({ messages: initialMessages, tools: [] }, next);
    expect(next).toHaveBeenCalled();
    const calledWith = next.mock.calls[0][0] as { messages: Message[] };
    expect(calledWith.messages.length).toBe(3);
    expect(calledWith.messages[0]?.role).toBe("system");
    expect(calledWith.messages[1]?.content).toContain("summary of giant message");
  });
});
