# Plugin Development Guide

Everything you need to build, test, and distribute a Thiny plugin.

---

## What a plugin is

A plugin is a plain TypeScript object satisfying the `Plugin` interface. Every field is optional. The smallest plugin is just `{ name, tools }`.

```ts
import type { Plugin } from "@thiny/core";

export const myPlugin: Plugin = {
  name: "my-plugin",
  tools: [
    /* ... */
  ],
};
```

You package it as a factory function when it needs configuration:

```ts
export function myPlugin(opts: { apiKey: string }): Plugin {
  return {
    name: "my-plugin",
    tools: [
      /* built from opts */
    ],
  };
}
```

---

## The five extension points

| Field             | Purpose                               | When to use                                         |
| ----------------- | ------------------------------------- | --------------------------------------------------- |
| `tools`           | Callable capabilities                 | 90% of plugins. The main event.                     |
| `modelMiddleware` | Wrap every LLM call                   | Caching, cost tracking, prompt shaping, compaction  |
| `toolMiddleware`  | Wrap every tool execution             | Policy, approval, audit, rate-limiting, idempotency |
| `memory`          | Replace the conversation store        | Swap in-memory → SQLite → vector DB                 |
| `setup(ctx)`      | Initialise after all plugins register | Open connections, find sibling tools                |

---

## Anatomy of a tool

```ts
import { z } from "zod";
import { defineTool } from "@thiny/core";

export const getWeatherTool = defineTool({
  // 1. Name — unique, snake_case, namespaced by domain (evm_, web_, sol_)
  name: "weather_get_current",

  // 2. Description — the LLM reads this to decide WHEN and HOW to call.
  //    Write it for the model, not for humans.
  description:
    "Get the current weather for a city. " +
    "Returns temperature in Celsius, condition (sunny/cloudy/rainy), and wind speed. " +
    "Use when the user asks about weather, temperature, or outdoor conditions.",

  // 3. Parameters — Zod schema. Does double duty:
  //    a) runtime validates the LLM's JSON args before execute() sees them
  //    b) auto-generates the JSON schema sent to the model
  parameters: z.object({
    city: z.string().min(1).describe("city name, e.g. 'Tokyo'"),
    units: z.enum(["celsius", "fahrenheit"]).default("celsius"),
  }),

  // 4. sensitive — set true for money-moving / destructive tools.
  //    This makes the policy engine default to "approve" (requiring explicit consent).
  sensitive: false,

  // 5. execute — receives validated args and the shared context.
  //    Must return JSON-serialisable data. Throw on failure — never return error objects.
  execute: async ({ city, units }, ctx) => {
    ctx.logger.info({ tool: "weather_get_current", city }, "fetching weather");
    const data = await fetchWeatherFromApi(city, units); // your real API call
    return { city, temp: data.temp, condition: data.condition, windKph: data.windKph };
  },
});
```

### Tool authoring rules

1. **Description is a prompt.** State what it does, when to use it, and what it returns. Poor descriptions = the model never calls it or calls it wrong.
2. **Validate everything in `parameters`.** The args come from an LLM — treat them as hostile. Use `.regex()`, `.min()`, `.max()`, `.enum()`.
3. **Return JSON-serialisable data.** No `BigInt` (use `.toString()`), no class instances, no raw `Date` (use `.toISOString()`).
4. **Throw on failure, never return error objects.** The loop catches throws and feeds `ERROR: <message>` back to the model, which lets it recover.
5. **Mark money/destructive tools `sensitive: true`.** Never rely on the prompt to stop the model.
6. **Keep tools idempotent or idempotency-keyed** when they cause side effects.

---

## A complete minimal plugin

```ts
// packages/plugins/crypto-prices/src/index.ts
import { z } from "zod";
import { defineTool, type Plugin } from "@thiny/core";

export interface CryptoPricesOptions {
  fetchImpl?: typeof fetch; // injectable for testing
}

export function cryptoPricesPlugin(opts: CryptoPricesOptions = {}): Plugin {
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    name: "crypto-prices",
    tools: [
      defineTool({
        name: "crypto_get_price",
        description:
          "Get the current USD price of a cryptocurrency by its CoinGecko id " +
          "(e.g. 'bitcoin', 'ethereum', 'solana'). Use for any crypto price question.",
        parameters: z.object({
          id: z.string().describe("CoinGecko coin id"),
        }),
        execute: async ({ id }) => {
          const res = await doFetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
          );
          if (!res.ok) throw new Error(`crypto_get_price failed: HTTP ${res.status}`);
          const data = (await res.json()) as Record<string, { usd: number }>;
          const price = data[id]?.usd;
          if (price === undefined) throw new Error(`no price found for: ${id}`);
          return { id, priceUsd: price };
        },
      }),
    ],
  };
}
```

---

## Testing a plugin

Unit test tools directly by injecting fakes — no real network, no real RPC.

```ts
// packages/plugins/crypto-prices/src/__tests__/index.test.ts
import { describe, it, expect, vi } from "vitest";
import { cryptoPricesPlugin } from "../index.js";

describe("cryptoPricesPlugin", () => {
  it("returns the price for a valid coin id", async () => {
    const fakeFetch = vi.fn(
      async () => new Response(JSON.stringify({ bitcoin: { usd: 65_000 } }), { status: 200 }),
    );
    const plugin = cryptoPricesPlugin({ fetchImpl: fakeFetch as unknown as typeof fetch });
    const tool = plugin.tools![0]!;
    const out = (await tool.execute({ id: "bitcoin" }, {} as never)) as { priceUsd: number };
    expect(out.priceUsd).toBe(65_000);
  });

  it("throws on non-OK HTTP status", async () => {
    const fakeFetch = vi.fn(async () => new Response("", { status: 429 }));
    const plugin = cryptoPricesPlugin({ fetchImpl: fakeFetch as unknown as typeof fetch });
    await expect(plugin.tools![0]!.execute({ id: "bitcoin" }, {} as never)).rejects.toThrow(
      /HTTP 429/,
    );
  });
});
```

Run: `pnpm vitest run packages/plugins/crypto-prices`

---

## Using the two-phase lifecycle

Use `setup` when your plugin needs to initialise after all other plugins have registered — for example, to find a sibling tool or open a connection.

```ts
export function dexPlugin(): Plugin {
  return {
    name: "dex",
    tools: [
      /* swap tool */
    ],
    async setup(ctx) {
      // Phase 2: the evm plugin's tools are already registered
      const readContract = ctx.tools.get("evm_read_contract");
      ctx.logger.info({ plugin: "dex", readContract: readContract.name }, "dex ready");
    },
  };
}
```

---

## Writing middleware in a plugin

### Model middleware (wraps the LLM call)

```ts
import type { ModelMiddleware } from "@thiny/core";

// Cache identical requests to save cost
export const cacheMiddleware = (): ModelMiddleware => {
  const cache = new Map<string, unknown>();
  return async (req, next) => {
    const key = JSON.stringify(req.messages);
    if (cache.has(key)) return cache.get(key) as never;
    const res = await next(req);
    cache.set(key, res);
    return res;
  };
};

// Use it in a plugin:
export function cachePlugin(): Plugin {
  return { name: "cache", modelMiddleware: [cacheMiddleware()] };
}
```

### Tool middleware (wraps each tool execution)

```ts
import type { ToolMiddleware } from "@thiny/core";

// Per-tool rate limiter
export const rateLimit = (perMinute: number): ToolMiddleware => {
  const hits: number[] = [];
  return async (call, next) => {
    const now = Date.now();
    while (hits.length && now - hits[0]! > 60_000) hits.shift();
    if (hits.length >= perMinute) throw new Error(`rate limit: ${call.tool.name}`);
    hits.push(now);
    return next(call);
  };
};
```

**To deny, throw before calling `next`.** The loop converts the throw into an observation; the agent sees it and can adapt.

**Compose order** matters — first in the array wraps everything:

```
[timeout, retry, rateLimit, cache] → last in = innermost
```

Put circuit breakers outermost, cache innermost.

---

## The security contract (non-negotiable for on-chain plugins)

1. **Mark `sensitive: true`** on anything that moves value or is destructive.
2. **Write deterministic `PolicyRule`s** that compute decisions from tool definition + parsed args **only** — never from model text or tool output.
3. **Cap + allowlist at the schema level**, not in the system prompt.
4. **Validate at the schema.** Address regexes, value bounds, `enum`-restricted actions.
5. **Mainnet is opt-in.** The signer adapter refuses mainnet unless explicitly allowed.

```ts
// ✅ correct: deterministic from parsed args
const myRule: PolicyRule = (call) => {
  if (call.tool.name !== "evm_send_native") return null;
  const args = call.args as { valueWei: string };
  if (BigInt(args.valueWei) > MAX_WEI) return { effect: "deny", reason: "exceeds cap" };
  return { effect: "approve", reason: "within cap" };
};

// ❌ wrong: reading model text — this is the prompt-injection hole
const badRule: PolicyRule = (call) => {
  if (call.ctx.state.get("lastModelText")?.includes("approved")) {
    /* ... */
  }
};
```

---

## Plugin packaging

**In the monorepo** — create `packages/plugins/<name>/`:

```
packages/plugins/my-plugin/
  package.json        name: "@thiny/plugin-<name>", deps: @thiny/core
  tsconfig.json       extends ../../../tsconfig.base.json, references ../../core
  src/
    index.ts          export function myPlugin(...): Plugin
    __tests__/
      index.test.ts
```

**As a standalone npm package** — publish with `@thiny/core` as a **peerDependency**:

```json
{
  "name": "@yourscope/thiny-plugin-weather",
  "peerDependencies": { "@thiny/core": ">=0.1.0" }
}
```

---

## Plugin design checklist

- [ ] One plugin = one coherent domain (don't bundle unrelated tools)
- [ ] Tool names are `domain_verb_noun` (`evm_get_balance`, `web_search`, `sol_swap_execute`)
- [ ] Descriptions written for the model, not humans
- [ ] All inputs Zod-validated; values bounded; enums for categorical choices
- [ ] Returns JSON-serialisable data; BigInts stringified
- [ ] Failures `throw` with actionable messages (include the HTTP status, the API error, the contract address)
- [ ] Money/destructive tools have `sensitive: true` + a deterministic `PolicyRule`
- [ ] I/O injectable for tests; no real network in unit tests
- [ ] `setup` used only for init that genuinely needs the full registry/services
- [ ] No import of other plugins; depends only on `@thiny/core` (+ own domain deps)
