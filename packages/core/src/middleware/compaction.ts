import type { ModelMiddleware } from "../middleware.js";
import type { Message } from "../domain/messages.js";
import type { ModelProvider } from "../ports.js";

export interface CompactionOptions {
  maxMessages: number;
  keepRecent: number;
  summarizer: ModelProvider;
}

/** Summarises the middle of the conversation into a single system note. */
export function compactionMiddleware(opts: CompactionOptions): ModelMiddleware {
  return async (req, next) => {
    if (req.messages.length <= opts.maxMessages) return next(req);

    const system = req.messages.filter((m) => m.role === "system");
    const body = req.messages.filter((m) => m.role !== "system");
    const recent = body.slice(-opts.keepRecent);
    const toSummarize = body.slice(0, body.length - opts.keepRecent);

    const transcript = toSummarize
      .map((m) => `${m.role}: ${"content" in m ? m.content : ""}`)
      .join("\n");

    const res = await opts.summarizer.generate(
      [
        {
          role: "system",
          content:
            "Summarise the conversation preserving facts, decisions, and open tasks. Be concise.",
        },
        { role: "user", content: transcript },
      ],
      [],
    );

    const summaryNote: Message = {
      role: "system",
      content: `[conversation summary]\n${res.text ?? ""}`,
    };
    return next({ ...req, messages: [...system, summaryNote, ...recent] });
  };
}
