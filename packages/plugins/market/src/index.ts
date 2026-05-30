import { z } from "zod";
import { defineTool, type Plugin } from "@thiny/core";

const POSITIONS_KEY = "portfolio:positions";

interface Position {
  token: string;
  amount: string;
  avgCostUsd: string;
  updatedAt: string;
}

export interface MarketPluginOptions {
  /** CoinGecko-compatible API base URL. Default: CoinGecko public API. */
  apiBase?: string;
  /** Inject a fetch implementation (useful for tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Market data + portfolio tracking plugin.
 *
 * Tools:
 * - `market_price` — fetch current prices from CoinGecko-compatible API
 * - `portfolio_update` — record a position in per-run state
 * - `portfolio_get` — read the current portfolio snapshot
 *
 * Portfolio state is stored in `ctx.state` — it persists within a single run
 * but not across runs. For persistent portfolio tracking, extend `ctx.state`
 * writes to a database or use `@thiny/memory-sqlite`.
 *
 * @example
 * ```ts
 * plugins: [marketPlugin()]
 * // Agent can now call: market_price({ ids: ["ethereum", "bitcoin"] })
 * ```
 */
export function marketPlugin(opts: MarketPluginOptions = {}): Plugin {
  const apiBase = opts.apiBase ?? "https://api.coingecko.com/api/v3";
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    name: "market",
    tools: [
      defineTool({
        name: "market_price",
        description:
          "Get current prices for one or more tokens by CoinGecko ID (e.g. 'ethereum', 'bitcoin', 'solana', 'usd-coin'). " +
          "Use for any question about current token prices before making trading decisions.",
        parameters: z.object({
          ids: z.array(z.string()).min(1).max(10).describe("CoinGecko token IDs"),
          currency: z.string().default("usd").describe("currency for prices (default: usd)"),
        }),
        execute: async ({ ids, currency }) => {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          const url = `${apiBase}/simple/price?ids=${ids.join(",")}&vs_currencies=${currency}`;
          const res = await fetchImpl(url);
          if (!res.ok) {
            throw new Error(
              `market_price failed: HTTP ${String(res.status)} — check CoinGecko status`,
            );
          }
          const data = (await res.json()) as Record<string, Record<string, number>>;
          const prices: Record<string, number> = {};
          for (const id of ids) {
            const safeId = id;
            const safeCurrency = currency ?? "usd";
            const price = data[safeId]?.[safeCurrency];
            prices[id] = typeof price === "number" ? price : 0;
          }
          return { prices, currency, fetchedAt: new Date().toISOString() };
        },
      }),

      defineTool({
        name: "portfolio_update",
        description:
          "Record or update a position in the in-run portfolio tracker. " +
          "Call after executing a trade or receiving tokens.",
        parameters: z.object({
          token: z.string().describe("token symbol (e.g. ETH, USDC)"),
          amount: z.string().describe("amount held"),
          avgCostUsd: z.string().describe("average cost basis in USD"),
        }),
        execute: ({ token, amount, avgCostUsd }, ctx): Promise<unknown> => {
          const positions = (ctx.state.get(POSITIONS_KEY) as Position[] | undefined) ?? [];
          const idx = positions.findIndex((p) => p.token === token);
          const entry: Position = {
            token,
            amount,
            avgCostUsd,
            updatedAt: new Date().toISOString(),
          };
          if (idx >= 0) {
            positions[idx] = entry;
          } else {
            positions.push(entry);
          }
          ctx.state.set(POSITIONS_KEY, positions);
          return Promise.resolve({ updated: entry, totalPositions: positions.length });
        },
      }),

      defineTool({
        name: "portfolio_get",
        description:
          "Return the current portfolio snapshot — all recorded positions and their amounts.",
        parameters: z.object({}),
        execute: (_args, ctx): Promise<{ positions: unknown[] }> =>
          Promise.resolve({
            positions: (ctx.state.get(POSITIONS_KEY) as Position[] | undefined) ?? [],
          }),
      }),
    ],
  };
}
