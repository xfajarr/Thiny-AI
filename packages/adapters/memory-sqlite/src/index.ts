import { createClient, type Client } from "@libsql/client";
import type { MemoryBackend, Message } from "@thiny/core";

/** Configuration for the SQLite-backed memory adapter. */
export interface SqliteMemoryOptions {
  /**
   * libsql connection URL.
   * - `":memory:"` — in-process, ephemeral (useful in tests)
   * - `"file:thiny.sqlite"` — local file, persistent across restarts
   * - `"libsql://..."` — Turso remote database
   */
  url: string;
  /** Turso auth token. Only required for remote `libsql://` URLs. */
  authToken?: string;
}

/**
 * SQLite-backed conversation memory using libsql.
 *
 * **Upsert semantics:** `append` overwrites the full transcript for a session
 * rather than incrementally adding messages. This matches the kernel's design
 * where `runLoop` returns the complete message list after every run.
 */
class SqliteMemory implements MemoryBackend {
  constructor(private readonly db: Client) {}

  async load(sessionId: string): Promise<Message[]> {
    const result = await this.db.execute({
      sql: "SELECT payload FROM transcripts WHERE session = ?",
      args: [sessionId],
    });
    const row = result.rows[0];
    if (!row) return [];
    return JSON.parse(row.payload as string) as Message[];
  }

  async append(sessionId: string, messages: Message[]): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO transcripts (session, payload) VALUES (?, ?)
            ON CONFLICT(session) DO UPDATE SET payload = excluded.payload`,
      args: [sessionId, JSON.stringify(messages)],
    });
  }
}

/**
 * Create a SQLite-backed `MemoryBackend` using libsql.
 *
 * Creates the `transcripts` table on first call (idempotent).
 *
 * @example local file (persistent)
 * ```ts
 * const memory = await sqliteMemory({ url: "file:thiny.sqlite" });
 * ```
 *
 * @example in-memory (tests / ephemeral)
 * ```ts
 * const memory = await sqliteMemory({ url: ":memory:" });
 * ```
 *
 * @example Turso remote
 * ```ts
 * const memory = await sqliteMemory({
 *   url: process.env.TURSO_URL!,
 *   authToken: process.env.TURSO_TOKEN,
 * });
 * ```
 */
export async function sqliteMemory(opts: SqliteMemoryOptions): Promise<MemoryBackend> {
  const db = createClient({ url: opts.url, authToken: opts.authToken });
  await db.execute(
    `CREATE TABLE IF NOT EXISTS transcripts (
       session TEXT PRIMARY KEY,
       payload TEXT NOT NULL
     )`,
  );
  return new SqliteMemory(db);
}
