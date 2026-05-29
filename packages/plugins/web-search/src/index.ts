import { z } from "zod";
import { defineTool, type Plugin } from "@thiny/core";

export interface WebSearchOptions {
  apiKey: string;
  /** Override the default Brave Search endpoint (useful for testing). */
  endpoint?: string;
  /** Inject a fetch implementation (useful for testing). */
  fetchImpl?: typeof fetch;
}

interface BraveResponse {
  web?: { results?: Array<{ title: string; url: string; description: string }> };
}

/**
 * Web-search plugin powered by the Brave Search API.
 *
 * @example
 * ```ts
 * import { webSearchPlugin } from "@thiny/plugin-web-search";
 *
 * const agent = await createAgent({
 *   model: aiSdkModel({ model: "openai:gpt-4o-mini" }),
 *   plugins: [webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY! })],
 * });
 * ```
 */
export function webSearchPlugin(opts: WebSearchOptions): Plugin {
  const endpoint = opts.endpoint ?? "https://api.search.brave.com/res/v1/web/search";
  const doFetch  = opts.fetchImpl ?? fetch;

  return {
    name: "web-search",
    tools: [
      defineTool({
        name: "web_search",
        description:
          "Search the public web and return the top results (title, url, snippet). " +
          "Use when asked about current events, facts, or any topic you are not sure about.",
        parameters: z.object({
          query: z.string().min(1).describe("the search query"),
          count: z.number().int().min(1).max(10).default(5).describe("number of results"),
        }),
        execute: async ({ query, count }) => {
          const url = `${endpoint}?q=${encodeURIComponent(query)}&count=${String(count)}`;
          const res = await doFetch(url, {
            headers: {
              Accept: "application/json",
              "X-Subscription-Token": opts.apiKey,
            },
          });
          if (!res.ok) throw new Error(`web_search failed: HTTP ${String(res.status)}`);
          const data = (await res.json()) as BraveResponse;
          return {
            results: (data.web?.results ?? []).map((r) => ({
              title:   r.title,
              url:     r.url,
              snippet: r.description,
            })),
          };
        },
      }),
    ],
  };
}
