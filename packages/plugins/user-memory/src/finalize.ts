/**
 * Session finalisation: extract learnings from a completed session
 * and merge them into the user's long-term memory.
 */
import type { ModelProvider, MemoryBackend } from "@thiny/core";
import type { UserMemory, SessionSummary } from "./types.js";
import { loadUserMemory, saveUserMemory } from "./storage.js";

/** Input for `finalizeSession`. */
export interface FinalizeOptions {
  model: ModelProvider;
  backend: MemoryBackend;
  userId: string;
  sessionId: string;
  maxSummaries?: number;
  maxFacts?: number;
}

interface ExtractionResult {
  summary: string;
  newFacts: string[];
  newPreferences: string[];
}

/**
 * Call this after a session ends to extract learnings and update user memory.
 *
 * Uses the model to (a) summarise the conversation and (b) extract new facts
 * and preferences. Deduplicates and caps at `maxFacts` / `maxSummaries`.
 *
 * @example
 * ```ts
 * // After the user's last message:
 * await finalizeSession({ model, backend, userId: "alice", sessionId: "alice:s1" });
 * // Next session automatically loads alice's facts, prefs, and summaries.
 * ```
 */
export async function finalizeSession(input: FinalizeOptions): Promise<UserMemory> {
  const maxSummaries = input.maxSummaries ?? 10;
  const maxFacts = input.maxFacts ?? 30;

  const transcript = await input.backend.load(input.sessionId);
  if (transcript.length === 0) return loadUserMemory(input.backend, input.userId);

  const conversationText = transcript
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${"content" in m ? m.content : ""}`)
    .join("\n");

  const extraction = await extractLearnings(input.model, conversationText);
  const mem = await loadUserMemory(input.backend, input.userId);

  // Prepend newest summary and drop oldest when over limit
  const summary: SessionSummary = {
    sessionId: input.sessionId,
    date: new Date().toISOString().split("T")[0] ?? new Date().toISOString(),
    summary: extraction.summary,
  };
  mem.sessionSummaries.unshift(summary);
  if (mem.sessionSummaries.length > maxSummaries) {
    mem.sessionSummaries = mem.sessionSummaries.slice(0, maxSummaries);
  }

  // Merge, deduplicate
  for (const fact of extraction.newFacts) {
    if (fact.trim() && !mem.facts.includes(fact)) mem.facts.push(fact);
  }
  if (mem.facts.length > maxFacts) mem.facts = mem.facts.slice(-maxFacts);

  for (const pref of extraction.newPreferences) {
    if (pref.trim() && !mem.preferences.includes(pref)) mem.preferences.push(pref);
  }
  if (mem.preferences.length > maxFacts) mem.preferences = mem.preferences.slice(-maxFacts);

  mem.lastUpdated = new Date().toISOString();
  await saveUserMemory(input.backend, mem);
  return mem;
}

async function extractLearnings(
  model: ModelProvider,
  transcript: string,
): Promise<ExtractionResult> {
  const prompt =
    `Analyse this conversation and extract:\n` +
    `1. A one-paragraph summary\n` +
    `2. New facts about the user (role, projects, tools — not obvious from every conversation)\n` +
    `3. Communication preferences observed\n\n` +
    `Respond with ONLY valid JSON: { "summary": "...", "newFacts": [...], "newPreferences": [...] }\n\n` +
    `Transcript:\n${transcript.slice(0, 6000)}`;

  try {
    const response = await model.generate(
      [
        { role: "system", content: "Extract structured insights. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      [],
    );
    const json = /\{[\s\S]*\}/u.exec(response.text ?? "")?.[0] ?? "{}";
    return JSON.parse(json) as ExtractionResult;
  } catch {
    return {
      summary: `Session on ${new Date().toLocaleDateString()}`,
      newFacts: [],
      newPreferences: [],
    };
  }
}
