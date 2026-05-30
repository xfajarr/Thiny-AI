/**
 * Thiny HTTP head — streams agent responses over SSE to a browser chat UI.
 *
 * Usage:
 *   pnpm http                      # listens on http://localhost:8787
 *   PORT=3000 pnpm http
 */
import { createServer } from "node:http";
import { createClient } from "@libsql/client";
import { createAgent } from "@thiny/core";
import { loadThinyConfig } from "@thiny/model-aisdk";
import { pinoLogger } from "@thiny/logger-pino";
import { sqliteMemory } from "@thiny/memory-sqlite";
import { webSearchPlugin } from "@thiny/plugin-web-search";
import { streamChat } from "./sse.js";
import { WEB_UI } from "./web.js";

async function main(): Promise<void> {
  const logger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info" });

  const personaName = process.env.THINY_PERSONA_NAME;
  const personaDescription = process.env.THINY_PERSONA_DESCRIPTION;
  const persona = personaName ? { name: personaName, description: personaDescription } : undefined;

  const plugins = [];
  if (process.env.BRAVE_API_KEY) {
    plugins.push(webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY }));
  }

  const dbUrl = process.env.SESSION_DB ?? "file:thiny.sqlite";
  const db = createClient({ url: dbUrl });
  const agent = await createAgent({
    model: loadThinyConfig(),
    logger,
    memory: await sqliteMemory({ url: dbUrl }),
    persona,
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

    // OPTIONS preflight for CORS
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }

    // GET /sessions — list all sessions with metadata
    if (req.method === "GET" && req.url === "/sessions") {
      res.setHeader("access-control-allow-origin", "*");
      try {
        const result = await db.execute(
          "SELECT session, payload FROM transcripts ORDER BY rowid DESC LIMIT 100",
        );
        const sessions = result.rows.map((row) => {
          const sessionId = row.session as string;
          let messages: Array<{ role: string; content?: unknown }> = [];
          try {
            messages = JSON.parse(row.payload as string) as typeof messages;
          } catch { /* ignore */ }
          const lastMsg = [...messages]
            .reverse()
            .find((m) => m.role === "user" || m.role === "assistant");
          const lastMessage =
            lastMsg && typeof lastMsg.content === "string"
              ? lastMsg.content.slice(0, 120)
              : "";
          return { id: sessionId, messageCount: messages.length, lastMessage, updatedAt: Date.now() };
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ sessions }));
      } catch (err) {
        res.writeHead(500).end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    // DELETE /sessions/:id — remove a session
    if (req.method === "DELETE" && req.url?.startsWith("/sessions/")) {
      res.setHeader("access-control-allow-origin", "*");
      const sessionId = decodeURIComponent(req.url.slice("/sessions/".length));
      try {
        await db.execute({ sql: "DELETE FROM transcripts WHERE session = ?", args: [sessionId] });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ deleted: true, id: sessionId }));
      } catch (err) {
        res.writeHead(500).end(JSON.stringify({ error: String(err) }));
      }
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
