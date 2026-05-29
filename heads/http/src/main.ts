/**
 * Thiny HTTP head — streams agent responses over SSE to a browser chat UI.
 *
 * Usage:
 *   pnpm http                      # listens on http://localhost:8787
 *   PORT=3000 pnpm http
 */
import { createServer } from "node:http";
import { createAgent } from "@thiny/core";
import { loadThinyConfig } from "@thiny/model-aisdk";
import { pinoLogger } from "@thiny/logger-pino";
import { sqliteMemory } from "@thiny/memory-sqlite";
import { webSearchPlugin } from "@thiny/plugin-web-search";
import { streamChat } from "./sse.js";
import { WEB_UI } from "./web.js";

async function main(): Promise<void> {
  const logger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info" });

  const plugins = [];
  if (process.env.BRAVE_API_KEY) {
    plugins.push(webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY }));
  }

  const agent = await createAgent({
    model: loadThinyConfig(),
    logger,
    memory: await sqliteMemory({ url: process.env.SESSION_DB ?? "file:thiny.sqlite" }),
    systemPrompt: "You are a helpful web-based AI assistant. Be concise and helpful.",
    plugins,
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(WEB_UI);
      return;
    }

    if (req.method === "POST" && req.url === "/chat") {
      let body = "";
      for await (const chunk of req) body += chunk as string;

      const { input, sessionId } = JSON.parse(body || "{}") as {
        input: string;
        sessionId?: string;
      };

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });

      await streamChat(agent, input, sessionId ?? "web", (chunk) => res.write(chunk));
      res.end();
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  });

  const port = Number(process.env.PORT ?? 8787);
  server.listen(port, () => {
    logger.info(
      { event: "http_ready", port, url: `http://localhost:${String(port)}` },
      `HTTP head ready at http://localhost:${String(port)}`,
    );
  });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
