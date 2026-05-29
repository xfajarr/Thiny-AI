import { z } from "zod";
import { defineTool, type Plugin } from "@thiny/core";

/** Configuration for the Brave Search API plugin. */
export interface WebSearchOptions {
  /**
   * Brave Search API subscription key.
   * Validated at construction time — a missing or empty key will throw
   * immediately rather than failing silently on the first search call.
   */
  apiKey: string;
  /** Override the default Brave Search endpoint. Primarily for testing. */
  endpoint?: string;
  /** Inject a custom fetch implementation. Primarily for testing. */
  fetchImpl?: typeof fetch;
}

interface BraveSearchResponse {
  web?: { results?: Array<{ title: string; url: string; description: string }> };
}

/**
 * Web-search plugin powered by the Brave Search API.
 *
 * Registers a single `web_search` tool that queries the public web
 * and returns normalised results (title, url, snippet).
 *
 * @throws {Error} When `apiKey` is empty or missing.
 *
 * @example
 * ```ts
 * import { webSearchPlugin } from "@thiny/plugin-web-search";
 *
 * const agent = await createAgent({
 *   model: loadThinyConfig(),
 *   plugins: [webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY! })],
 * });
 * ```
 */

/** Map common Brave Search HTTP error codes to actionable messages. */
function describeHttpError(status: number): string {
  if (status === 401) return "Authentication failed — verify your BRAVE_API_KEY is correct.";
  if (status === 403) return "Access forbidden — check your API subscription level.";
  if (status === 422) return "Invalid query — the search request was malformed.";
  if (status === 429) return "Rate limit exceeded — slow down requests or upgrade your plan.";
  if (status >= 500) return "Brave Search server error — try again later.";
  return `Unexpected error — see Brave Search API docs for HTTP ${String(status)}.`;
}

export function webSearchPlugin(opts: WebSearchOptions): Plugin {
  if (!opts.apiKey.trim()) {
    throw new Error(
      "webSearchPlugin: apiKey is required. " +
        "Obtain a key at https://brave.com/search/api/ and set BRAVE_API_KEY in .env.",
    );
  }

  const endpoint = opts.endpoint ?? "https://api.search.brave.com/res/v1/web/search";
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    name: "web-search",
    tools: [
      defineTool({
        name: "web_search",
        description:
          "Search the public web and return the top results (title, url, snippet). " +
          "Use when asked about current events, recent facts, or any topic you are not certain about.",
        parameters: z.object({
          query: z.string().min(1).describe("The search query."),
          count: z
            .number()
            .int()
            .min(1)
            .max(10)
            .default(5)
            .describe("Number of results to return (1–10)."),
        }),
        execute: async ({ query, count }) => {
          const url = `${endpoint}?q=${encodeURIComponent(query)}&count=${String(count)}`;
          const response = await fetchImpl(url, {
            headers: {
              Accept: "application/json",
              "X-Subscription-Token": opts.apiKey,
            },
          });

          if (!response.ok) {
            throw new Error(
              `web_search failed: HTTP ${String(response.status)} — ${describeHttpError(response.status)}`,
            );
          }

          const data = (await response.json()) as BraveSearchResponse;
          return {
            results: (data.web?.results ?? []).map((result) => ({
              title: result.title,
              url: result.url,
              snippet: result.description,
            })),
          };
        },
      }),
    ],
  };
}
