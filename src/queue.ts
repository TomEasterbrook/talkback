/**
 * Message queue for handling rapid-fire speech requests.
 *
 * When multiple messages arrive quickly, they're queued and played
 * in order. A file-based lock prevents multiple processes from
 * playing audio simultaneously.
 */

import { readFile, writeFile, unlink, mkdir, open, FileHandle } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseMessageQueue, defaultMessageQueue, type Message, type Priority } from "./validation.js";
import { TALKBACK_DIR } from "./constants.js";

const QUEUE_FILE = join(TALKBACK_DIR, "queue.json");
const PLAYBACK_LOCK = join(TALKBACK_DIR, "play.lock");

export type { Message };

// Priority order (lower number = higher priority)
const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// --- Queue operations ---

export async function addToQueue(message: Message): Promise<void> {
  await ensureDir();
  const queue = await readQueue();

  // Insert based on priority (higher priority = earlier in queue)
  const msgPriority = PRIORITY_ORDER[message.priority ?? "normal"];
  let insertIndex = queue.length;

  for (let i = 0; i < queue.length; i++) {
    const existingPriority = PRIORITY_ORDER[queue[i].priority ?? "normal"];
    if (msgPriority < existingPriority) {
      insertIndex = i;
      break;
    }
  }

  queue.splice(insertIndex, 0, message);
  await writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

export async function takeFromQueue(): Promise<Message | null> {
  const queue = await readQueue();
  if (queue.length === 0) return null;

  const message = queue.shift()!;
  await writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2));
  return message;
}

// --- Playback lock ---
// Ensures only one process plays audio at a time

let lockHandle: FileHandle | null = null;

export async function acquirePlaybackLock(): Promise<boolean> {
  await ensureDir();

  try {
    lockHandle = await open(PLAYBACK_LOCK, "wx");
    await lockHandle.writeFile(String(process.pid));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      // Lock exists - check if holder is still alive
      if (await isLockStale()) {
        await unlink(PLAYBACK_LOCK).catch(() => {});
        return acquirePlaybackLock(); // Retry
      }
      return false; // Lock is held by active process
    }
    return false;
  }
}

export async function releasePlaybackLock(): Promise<void> {
  if (lockHandle) {
    await lockHandle.close();
    lockHandle = null;
  }
  await unlink(PLAYBACK_LOCK).catch(() => {});
}

// --- Helpers ---

async function ensureDir(): Promise<void> {
  if (!existsSync(TALKBACK_DIR)) {
    await mkdir(TALKBACK_DIR, { recursive: true });
  }
}

async function readQueue(): Promise<Message[]> {
  try {
    const content = await readFile(QUEUE_FILE, "utf-8");
    return parseMessageQueue(content);
  } catch (err) {
    // File doesn't exist or is corrupted - return empty queue
    if ((err as Error).message?.includes("Invalid queue")) {
      console.error("Warning: Queue file corrupted, resetting queue");
    }
    return defaultMessageQueue();
  }
}

async function isLockStale(): Promise<boolean> {
  try {
    const content = await readFile(PLAYBACK_LOCK, "utf-8");
    const pid = parseInt(content.trim(), 10);

    if (isNaN(pid)) return true;

    // Check if process is alive
    try {
      process.kill(pid, 0);
      return false; // Process exists
    } catch {
      return true; // Process is dead
    }
  } catch {
    return true;
  }
}
