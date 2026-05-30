/**
 * Storage helpers for user memory.
 * Uses the existing MemoryBackend so no extra infrastructure is needed.
 * Convention: session key `__user_memory__:<userId>` is reserved.
 */
import type { MemoryBackend } from "@thiny/core";
import { type UserMemory, emptyMemory } from "./types.js";

const USER_MEMORY_PREFIX = "__user_memory__:";

/** Build the reserved key for a user's memory record. */
export function userMemoryKey(userId: string): string {
  return `${USER_MEMORY_PREFIX}${userId}`;
}

/**
 * Load a user's memory from the backend.
 * Returns an empty `UserMemory` for first-time users.
 */
export async function loadUserMemory(backend: MemoryBackend, userId: string): Promise<UserMemory> {
  const messages = await backend.load(userMemoryKey(userId));
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
 * Stored as a single system message to fit the MemoryBackend interface.
 */
export async function saveUserMemory(backend: MemoryBackend, memory: UserMemory): Promise<void> {
  await backend.append(userMemoryKey(memory.userId), [
    { role: "system", content: JSON.stringify(memory) },
  ]);
}
