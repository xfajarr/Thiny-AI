import { z } from "zod";
import { defineTool, type Plugin, type ModelMiddleware, type MemoryBackend } from "@thiny/core";
import type { ModelProvider } from "@thiny/core";

// ─── Storage key convention ────────────────────────────────────────────────
// User memory is stored in the same MemoryBackend as sessions (e.g. SQLite),
// using a reserved key prefix that cannot clash with real session IDs.
const USER_MEMORY_PREFIX = "__user_memory__:";

function userMemoryKey(userId: string): string {
  return `${USER_MEMORY_PREFIX}${userId}`;
}

// ─── Types ─────────────────────────────────────────────────────────────────

/** A short summary of one past session. */
export interface SessionSummary {
  sessionId: string;
  date: string;
  summary: string;
}

/**
 * The persistent knowledge Thiny retains about a user across all sessions.
 * Stored as a JSON payload in the same MemoryBackend as session transcripts.
 */
export interface UserMemory {
  userId: string;
  /**
   * Key facts about the user extracted from their conversations.
   * @example ["builds DeFi apps on Ethereum", "prefers TypeScript over Python"]
   */
  facts: string[];
  /**
   * Communication and style preferences observed over time.
   * @example ["wants concise responses", "prefers code examples over prose"]
   */
  preferences: string[];
  /**
   * One-paragraph summaries of each past session, newest first.
   * Used to give the agent a "memory" of what was discussed before.
   */
  sessionSummaries: SessionSummary[];
  /** ISO-8601 timestamp of the last update. */
  lastUpdated: string;
}

/** An empty UserMemory for a new user. */
function emptyMemory(userId: string): UserMemory {
  return {
    userId,
    facts: [],
    preferences: [],
    sessionSummaries: [],
    lastUpdated: new Date().toISOString(),
  };
}

// ─── Storage helpers ───────────────────────────────────────────────────────

/**
 * Load a user's memory from the backend.
 * Returns an empty UserMemory for first-time users.
 */
export async function loadUserMemory(backend: MemoryBackend, userId: string): Promise<UserMemory> {
  const messages = await backend.load(userMemoryKey(userId));
  if (messages.length === 0) return emptyMemory(userId);
  const payload = messages[0];
  if (payload?.role !== "system") return emptyMemory(userId);
  try {
    return JSON.parse(payload.content) as UserMemory;
  } catch {
    return emptyMemory(userId);
  }
}

/**
 * Persist a user's memory to the backend.
 * Stored as a single system message so it fits the existing MemoryBackend API.
 */
export async function saveUserMemory(backend: MemoryBackend, memory: UserMemory): Promise<void> {
  await backend.append(userMemoryKey(memory.userId), [
    { role: "system", content: JSON.stringify(memory) },
  ]);
}

// ─── Options ──────────────────────────────────────────────────────────────

export interface UserMemoryOptions {
  /**
   * The user identifier. All sessions created with this plugin will share
   * the same user-level memory.
   * @example "user-42", "deryan@example.com"
   */
  userId: string;
  /**
   * The backend to read/write user memory from (same instance as the agent's
   * session memory — no extra infrastructure needed).
   */
  backend: MemoryBackend;
  /**
   * Model used to extract learnings and generate session summaries.
   * Defaults to the agent's own model. Pass a cheaper/faster model here
   * (e.g. a small local model) to reduce cost for extraction calls.
   */
  summarizer?: ModelProvider;
  /**
   * Maximum number of session summaries to keep in memory.
   * Oldest summaries are dropped when this limit is exceeded.
   * Default: 10.
   */
  maxSummaries?: number;
  /**
   * Maximum number of facts to retain about a user.
   * When exceeded, the model is asked to merge/deduplicate. Default: 30.
   */
  maxFacts?: number;
}

// ─── Plugin ───────────────────────────────────────────────────────────────

/**
 * Cross-session user memory plugin.
 *
 * Gives the agent a persistent long-term memory of each user that survives
 * across separate conversation sessions. The agent can:
 * - **Remember** facts and preferences from past conversations
 * - **Learn** from every session automatically (summaries + fact extraction)
 * - **Improve** over time without the user having to repeat themselves
 *
 * **Architecture:** user memory is stored in the same SQLite backend as
 * session transcripts, using a reserved key prefix. No extra infrastructure
 * is needed beyond `@thiny/memory-sqlite`.
 *
 * **Session lifecycle:**
 * 1. **Session start** — injects a system message with the user's known facts,
 *    preferences, and recent session summaries into every model call.
 * 2. **Session end** — asks the model to (a) summarise the conversation and
 *    (b) extract any new facts or preferences. Updates user memory.
 *
 * **Tools contributed:**
 * - `memory_get_user` — read the user's current memory (useful for debugging)
 * - `memory_update_fact` — let the user manually tell the agent something to remember
 * - `memory_clear` — let the user reset their memory
 *
 * @example
 * ```ts
 * import { userMemoryPlugin } from "@thiny/plugin-user-memory";
 *
 * const memory = await sqliteMemory({ url: "file:thiny.sqlite" });
 * const agent = await createAgent({
 *   model: loadThinyConfig(),
 *   memory,
 *   plugins: [
 *     userMemoryPlugin({ userId: "user-42", backend: memory }),
 *   ],
 * });
 *
 * // Session 1
 * await agent.run("I'm building a DeFi app on Ethereum", { sessionId: "user-42:s1" });
 * await finalizeSession(agent, "user-42", "user-42:s1", memory); // extract learnings
 *
 * // Session 2 — agent remembers the DeFi context automatically
 * await agent.run("What should I use for token transfers?", { sessionId: "user-42:s2" });
 * ```
 */
export function userMemoryPlugin(opts: UserMemoryOptions): Plugin {
  /** Build the context injection message from stored user memory. */
  function buildContextMessage(mem: UserMemory): string {
    const parts: string[] = [`[User Memory for ${mem.userId}]`];

    if (mem.facts.length > 0) {
      parts.push(`Known facts about this user:\n${mem.facts.map((f) => `- ${f}`).join("\n")}`);
    }

    if (mem.preferences.length > 0) {
      parts.push(`User preferences:\n${mem.preferences.map((p) => `- ${p}`).join("\n")}`);
    }

    if (mem.sessionSummaries.length > 0) {
      const recent = mem.sessionSummaries.slice(0, 3);
      parts.push(
        `Recent session history:\n${recent.map((s) => `[${s.date}] ${s.summary}`).join("\n")}`,
      );
    }

    if (parts.length === 1) {
      parts.push("No prior history with this user — this appears to be their first session.");
    }

    return parts.join("\n\n");
  }

  /** Model middleware that injects user context on every model call. */
  const contextMiddleware: ModelMiddleware = async (req, next) => {
    const mem = await loadUserMemory(opts.backend, opts.userId);

    // Only inject if we have something useful to say
    if (
      mem.facts.length === 0 &&
      mem.preferences.length === 0 &&
      mem.sessionSummaries.length === 0
    ) {
      return next(req);
    }

    const contextContent = buildContextMessage(mem);
    const contextMessage = { role: "system" as const, content: contextContent };

    // Inject after the identity message (position 1) but before the user's
    // system prompt, so identity > user context > system prompt > history.
    const [first, ...rest] = req.messages;
    const messages =
      first?.role === "system" && first.content.includes("MUST always refer")
        ? [first, contextMessage, ...rest] // identity is first — inject after it
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
          "Retrieve the current memory stored about this user — facts, preferences, and session summaries. " +
          "Use when the user asks what you remember about them.",
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
          "Store a new fact or preference about the user that should be remembered across sessions. " +
          "Use when the user explicitly tells you something important to remember " +
          '(e.g. "remember that I prefer TypeScript" or "I work at Acme Corp").',
        parameters: z.object({
          fact: z.string().min(1).describe("The fact or preference to remember."),
          kind: z
            .enum(["fact", "preference"])
            .default("fact")
            .describe(
              '"fact" for facts about the user, "preference" for their style/communication preferences.',
            ),
        }),
        execute: async ({ fact, kind }, ctx) => {
          const mem = await loadUserMemory(opts.backend, opts.userId);

          if (kind === "preference") {
            if (!mem.preferences.includes(fact)) {
              mem.preferences.push(fact);
              if (mem.preferences.length > (opts.maxFacts ?? 30)) mem.preferences.shift();
            }
          } else {
            if (!mem.facts.includes(fact)) {
              mem.facts.push(fact);
              if (mem.facts.length > (opts.maxFacts ?? 30)) mem.facts.shift();
            }
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
          "Clear all stored memory for this user. " +
          "Use only when the user explicitly asks to reset or forget everything.",
        parameters: z.object({
          confirm: z
            .literal("yes")
            .describe('Must be exactly "yes" to confirm the irreversible clear.'),
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

// ─── Session finalisation helper ──────────────────────────────────────────

/**
 * Call this after a session ends to extract learnings and update user memory.
 *
 * Uses the agent's model (or a separate `summarizer` model) to:
 * 1. Summarise the session in one paragraph
 * 2. Extract new facts and preferences from the conversation
 *
 * **When to call:** after `agent.run()` for the last turn of a session,
 * before the user closes the session or starts a new one.
 *
 * @param model     - The model to use for extraction (agent's model or a dedicated one).
 * @param backend   - The same MemoryBackend the agent uses.
 * @param userId    - The user identifier.
 * @param sessionId - The session ID that just ended.
 * @param opts      - Optional overrides.
 *
 * @example
 * ```ts
 * // After the user's last message in a session:
 * await finalizeSession({ model, backend: memory, userId: "user-42", sessionId: "user-42:s1" });
 * ```
 */
export async function finalizeSession(input: {
  model: ModelProvider;
  backend: MemoryBackend;
  userId: string;
  sessionId: string;
  maxSummaries?: number;
  maxFacts?: number;
}): Promise<UserMemory> {
  const maxSummaries = input.maxSummaries ?? 10;
  const maxFacts = input.maxFacts ?? 30;

  // Load the session transcript
  const transcript = await input.backend.load(input.sessionId);
  if (transcript.length === 0) return loadUserMemory(input.backend, input.userId);

  const conversationText = transcript
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${"content" in m ? m.content : ""}`)
    .join("\n");

  // Ask the model to extract learnings in one call
  const extractionPrompt = `You are analysing a conversation to extract persistent user knowledge.
Given this conversation transcript, extract:
1. A one-paragraph summary of what was discussed (be specific and useful)
2. New facts about the user (who they are, what they do, their goals — NOT things said in every conversation)
3. Communication preferences observed (how they like answers, tone, format)

Respond with ONLY valid JSON matching this schema:
{
  "summary": "...",
  "newFacts": ["...", "..."],
  "newPreferences": ["...", "..."]
}

Transcript:
${conversationText.slice(0, 6000)}`;

  let extraction: { summary: string; newFacts: string[]; newPreferences: string[] };
  try {
    const response = await input.model.generate(
      [
        {
          role: "system",
          content:
            "You extract structured insights from conversations. Respond only with valid JSON.",
        },
        { role: "user", content: extractionPrompt },
      ],
      [],
    );

    const json = /\{[\s\S]*\}/.exec(response.text ?? "")?.[0] ?? "{}";
    extraction = JSON.parse(json) as typeof extraction;
  } catch {
    // Extraction failed — store a minimal summary and move on
    extraction = {
      summary: `Session ${input.sessionId} on ${new Date().toLocaleDateString()}`,
      newFacts: [],
      newPreferences: [],
    };
  }

  // Load current user memory and merge in new learnings
  const mem = await loadUserMemory(input.backend, input.userId);

  // Add session summary (newest first, capped at maxSummaries)
  const summary: SessionSummary = {
    sessionId: input.sessionId,
    date: new Date().toISOString().split("T")[0] ?? new Date().toISOString(),
    summary: extraction.summary,
  };
  mem.sessionSummaries.unshift(summary);
  if (mem.sessionSummaries.length > maxSummaries) {
    mem.sessionSummaries = mem.sessionSummaries.slice(0, maxSummaries);
  }

  // Merge new facts (deduplicate)
  for (const fact of extraction.newFacts) {
    if (fact.trim() && !mem.facts.includes(fact)) {
      mem.facts.push(fact);
    }
  }
  if (mem.facts.length > maxFacts) mem.facts = mem.facts.slice(-maxFacts);

  // Merge new preferences (deduplicate)
  for (const pref of extraction.newPreferences) {
    if (pref.trim() && !mem.preferences.includes(pref)) {
      mem.preferences.push(pref);
    }
  }
  if (mem.preferences.length > maxFacts) mem.preferences = mem.preferences.slice(-maxFacts);

  mem.lastUpdated = new Date().toISOString();
  await saveUserMemory(input.backend, mem);
  return mem;
}
