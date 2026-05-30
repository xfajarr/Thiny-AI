/**
 * @thiny/plugin-user-memory — cross-session user memory plugin.
 *
 * File structure:
 *   types.ts    — UserMemory, SessionSummary data types
 *   storage.ts  — loadUserMemory, saveUserMemory (MemoryBackend adapter)
 *   finalize.ts — finalizeSession (post-session learning extraction)
 *   index.ts    — userMemoryPlugin factory + barrel (this file)
 */

// Types
export type { UserMemory, SessionSummary } from "./types.js";

// Storage helpers (useful for custom tooling)
export { loadUserMemory, saveUserMemory, userMemoryKey } from "./storage.js";

// Session finalisation
export { finalizeSession } from "./finalize.js";
export type { FinalizeOptions } from "./finalize.js";

import { z } from "zod";
import { defineTool, type Plugin, type ModelMiddleware } from "@thiny/core";
import type { MemoryBackend } from "@thiny/core";
import { type UserMemory, emptyMemory } from "./types.js";
import { loadUserMemory, saveUserMemory } from "./storage.js";

/** Options for `userMemoryPlugin`. */
export interface UserMemoryOptions {
  /** Unique user identifier. All sessions for this user share the same memory. */
  userId: string;
  /** The same MemoryBackend as the agent uses — no extra infrastructure needed. */
  backend: MemoryBackend;
  /** Max session summaries to retain. Default: 10. */
  maxSummaries?: number;
  /** Max facts + preferences to retain. Default: 30. */
  maxFacts?: number;
}

function buildContextMessage(mem: UserMemory): string {
  const parts: string[] = [`[User Memory for ${mem.userId}]`];
  if (mem.facts.length > 0)
    parts.push(`Known facts:\n${mem.facts.map((f) => `- ${f}`).join("\n")}`);
  if (mem.preferences.length > 0)
    parts.push(`Preferences:\n${mem.preferences.map((p) => `- ${p}`).join("\n")}`);
  if (mem.sessionSummaries.length > 0) {
    const recent = mem.sessionSummaries.slice(0, 3);
    parts.push(`Recent sessions:\n${recent.map((s) => `[${s.date}] ${s.summary}`).join("\n")}`);
  }
  if (parts.length === 1) parts.push("First session with this user — no prior history.");
  return parts.join("\n\n");
}

/**
 * Cross-session user memory plugin.
 *
 * On each model call, injects a system message with the user's known facts,
 * preferences, and recent session summaries so the agent feels like it
 * "remembers" past conversations.
 *
 * Call `finalizeSession()` after each session to extract and store new learnings.
 *
 * @example
 * ```ts
 * const memory = await sqliteMemory({ url: "file:thiny.sqlite" });
 * const agent = await createAgent({
 *   memory,
 *   plugins: [userMemoryPlugin({ userId: "user-42", backend: memory })],
 * });
 *
 * // After the session ends:
 * await finalizeSession({ model, backend: memory, userId: "user-42", sessionId });
 * ```
 */
export function userMemoryPlugin(opts: UserMemoryOptions): Plugin {
  const maxFacts = opts.maxFacts ?? 30;

  const contextMiddleware: ModelMiddleware = async (req, next) => {
    const mem = await loadUserMemory(opts.backend, opts.userId);
    if (
      mem.facts.length === 0 &&
      mem.preferences.length === 0 &&
      mem.sessionSummaries.length === 0
    ) {
      return next(req);
    }
    const contextMessage = { role: "system" as const, content: buildContextMessage(mem) };
    const [first, ...rest] = req.messages;
    const messages =
      first?.role === "system" && first.content.includes("MUST always refer")
        ? [first, contextMessage, ...rest]
        : [contextMessage, ...req.messages];
    return next({ ...req, messages });
  };

  return {
    name: "user-memory",
    modelMiddleware: [contextMiddleware],
    tools: [
      defineTool({
        name: "memory_get_user",
        description:
          "Retrieve the current memory stored about this user — facts, preferences, session summaries. Use when asked what you remember.",
        parameters: z.object({}),
        execute: async (_args, ctx) => {
          const mem = await loadUserMemory(opts.backend, opts.userId);
          ctx.logger.info(
            { event: "memory_get_user", userId: opts.userId },
            "User memory retrieved",
          );
          return mem;
        },
      }),

      defineTool({
        name: "memory_update_fact",
        description:
          "Store a new fact or preference about the user to remember across sessions. " +
          'Use when the user explicitly tells you something to remember (e.g. "I prefer TypeScript").',
        parameters: z.object({
          fact: z.string().min(1).describe("The fact or preference to remember."),
          kind: z.enum(["fact", "preference"]).default("fact"),
        }),
        execute: async ({ fact, kind }, ctx) => {
          const mem = await loadUserMemory(opts.backend, opts.userId);
          const list = kind === "preference" ? mem.preferences : mem.facts;
          if (!list.includes(fact)) {
            list.push(fact);
            if (list.length > maxFacts) list.shift();
          }
          mem.lastUpdated = new Date().toISOString();
          await saveUserMemory(opts.backend, mem);
          ctx.logger.info(
            { event: "memory_update_fact", userId: opts.userId, kind, fact },
            "User memory updated",
          );
          return {
            stored: fact,
            kind,
            totalFacts: mem.facts.length,
            totalPreferences: mem.preferences.length,
          };
        },
      }),

      defineTool({
        name: "memory_clear",
        description:
          "Clear all stored memory for this user. Use only when the user explicitly asks to reset everything.",
        parameters: z.object({
          confirm: z.literal("yes").describe('Must be exactly "yes" to confirm.'),
        }),
        execute: async (_args, ctx) => {
          await saveUserMemory(opts.backend, emptyMemory(opts.userId));
          ctx.logger.warn({ event: "memory_clear", userId: opts.userId }, "User memory cleared");
          return { cleared: true, userId: opts.userId };
        },
      }),
    ],
  };
}
