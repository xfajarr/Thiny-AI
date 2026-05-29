# Quickstart — Running your first Thiny agent in 5 minutes

## Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- An OpenAI or Anthropic API key

---

## Step 1 — Clone and install

```bash
git clone https://github.com/getthiny/thiny
cd thiny
pnpm install
```

---

## Step 2 — Configure environment

```bash
cp .env.example .env
```

Open `.env` and set your API key:

```bash
OPENAI_API_KEY=sk-...          # or
ANTHROPIC_API_KEY=sk-ant-...
AGENT_MODEL=openai:gpt-4o-mini # or anthropic:claude-haiku-4-5-20251001
```

---

## Step 3 — Run the CLI agent

```bash
pnpm cli
```

```
Thiny agent ready  [model: openai:gpt-4o-mini]
Type a message and press Enter. Ctrl+C to quit.

> echo the word banana
```

The agent calls the built-in `echo` tool and streams the reply back. That is the whole kernel working end-to-end.

---

## Step 4 — Add a plugin

To enable web search, get a [Brave Search API key](https://brave.com/search/api/) and add it:

```bash
BRAVE_API_KEY=BSAxxxxxxx
```

Restart `pnpm cli` and ask:

```
> what are the top AI news stories today?
```

The agent now calls `web_search` automatically when it needs up-to-date information.

---

## Step 5 — Write your first tool

Open any file or create a new script:

```ts
import { createAgent, defineTool } from "@thiny/core";
import { aiSdkModel } from "@thiny/model-aisdk";
import { z } from "zod";

const weatherTool = defineTool({
  name: "get_weather",
  description: "Get the current weather for a city. Use when asked about weather.",
  parameters: z.object({
    city: z.string().describe("the city name"),
  }),
  execute: async ({ city }) => {
    // Replace with a real weather API call
    return { city, temp: "22°C", condition: "sunny" };
  },
});

const agent = await createAgent({
  model: aiSdkModel({ model: process.env.AGENT_MODEL ?? "openai:gpt-4o-mini" }),
  systemPrompt: "You are a helpful weather assistant.",
  tools: [weatherTool],
});

const reply = await agent.run("What's the weather in Tokyo?");
console.log(reply);
```

Run it:

```bash
node --env-file=.env --import tsx your-script.ts
```

---

## Step 6 — Write your first plugin

Bundle multiple tools as a reusable plugin:

```ts
import { defineTool, type Plugin } from "@thiny/core";
import { z } from "zod";

export function weatherPlugin(apiKey: string): Plugin {
  return {
    name: "weather",
    tools: [
      defineTool({
        name: "get_weather",
        description: "Get current weather. Use when asked about weather.",
        parameters: z.object({ city: z.string() }),
        execute: async ({ city }) => {
          const res = await fetch(`https://api.example.com/weather?city=${city}&key=${apiKey}`);
          return res.json();
        },
      }),
    ],
  };
}

// Use it:
const agent = await createAgent({
  model: aiSdkModel({ model: "openai:gpt-4o-mini" }),
  plugins: [weatherPlugin(process.env.WEATHER_API_KEY!)],
});
```

For a complete plugin authoring reference, see [PLUGINS.md](PLUGINS.md).

---

## What's next?

| Goal                                  | Where to look                                                     |
| ------------------------------------- | ----------------------------------------------------------------- |
| Understand the architecture           | [ARCHITECTURE.md](ARCHITECTURE.md)                                |
| Build a full plugin                   | [PLUGINS.md](PLUGINS.md)                                          |
| Add safety (policy, approval, budget) | [ARCHITECTURE.md — Safety](ARCHITECTURE.md#7-safety-architecture) |
| Stream token-by-token                 | `agent.run(input, { onToken: (d) => process.stdout.write(d) })`   |
| Persist sessions (SQLite)             | `@thiny/memory-sqlite` (Phase 4 of the plan)                      |
| On-chain / DeFi                       | `@thiny/plugin-evm`, `@thiny/plugin-solana` (Phases 5, 13)        |
| Always-on autonomous agent            | `@thiny/runtime` (Phase 9)                                        |
