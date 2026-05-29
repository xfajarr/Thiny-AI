import { describe, it, expect, vi } from "vitest";
import { webSearchPlugin } from "../index.js";

function getTool(apiKey: string, fetchImpl?: typeof fetch) {
  const plugin = webSearchPlugin({ apiKey, fetchImpl });
  const tool = plugin.tools?.[0];
  if (!tool) throw new Error("web-search plugin has no tools");
  return tool;
}

describe("webSearchPlugin", () => {
  it("contributes a web_search tool named correctly", () => {
    const plugin = webSearchPlugin({ apiKey: "test" });
    expect(plugin.name).toBe("web-search");
    expect(plugin.tools?.find((t) => t.name === "web_search")).toBeDefined();
  });

  it("returns normalised results from the API response", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "Thiny Docs",
                  url: "https://thiny.dev",
                  description: "Thin AI agent microkernel.",
                },
              ],
            },
          }),
          { status: 200 },
        ),
    );
    const tool = getTool("k", fakeFetch);
    const out = (await tool.execute({ query: "thiny agent", count: 1 }, {} as never)) as {
      results: Array<{ title: string; url: string; snippet: string }>;
    };
    expect(out.results).toEqual([
      { title: "Thiny Docs", url: "https://thiny.dev", snippet: "Thin AI agent microkernel." },
    ]);
    expect(fakeFetch).toHaveBeenCalledOnce();
  });

  it("throws a clear error on non-OK HTTP status", async () => {
    const fakeFetch = vi.fn(async () => new Response("", { status: 429 }));
    const tool = getTool("k", fakeFetch);
    await expect(tool.execute({ query: "test", count: 1 }, {} as never)).rejects.toThrow(
      /HTTP 429/,
    );
  });
});
