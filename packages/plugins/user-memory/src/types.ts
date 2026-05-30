/** Data types for user memory. Kept separate so storage.ts can import without plugin deps. */

/** A short summary of one past session. */
export interface SessionSummary {
  sessionId: string;
  date: string;
  summary: string;
}

/**
 * The persistent knowledge Thiny retains about a user across all sessions.
 * Stored as a JSON payload in the MemoryBackend alongside session transcripts.
 */
export interface UserMemory {
  userId: string;
  /** Key facts about the user extracted from their conversations. */
  facts: string[];
  /** Communication and style preferences observed over time. */
  preferences: string[];
  /** One-paragraph summaries of past sessions, newest first. */
  sessionSummaries: SessionSummary[];
  /** ISO-8601 timestamp of the last update. */
  lastUpdated: string;
}

export function emptyMemory(userId: string): UserMemory {
  return {
    userId,
    facts: [],
    preferences: [],
    sessionSummaries: [],
    lastUpdated: new Date().toISOString(),
  };
}
