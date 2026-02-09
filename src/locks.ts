/**
 * Voice reservation system for multi-session support.
 *
 * When running multiple agentic sessions, each can reserve a different voice
 * so you can tell them apart by sound. Reservations are tracked via lock files
 * that include the process ID, allowing automatic cleanup of stale locks.
 */

import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { VOICE_NAMES } from "./voices.js";
import { parseLockFile, type LockFile } from "./validation.js";

const LOCKS_DIR = join(homedir(), ".talkback", "locks");

export interface VoiceStatus {
  voice: string;
  available: boolean;
  pid?: number;
  since?: string;
}

// --- Public API ---

export async function reserveVoice(): Promise<string | null> {
  await ensureLocksDir();
  await cleanupStaleLocks();

  // Use parent PID (the shell) instead of our PID
  // This way the lock persists for the shell session, not just this command
  const shellPid = process.ppid;

  for (const voice of VOICE_NAMES) {
    if (await isAvailable(voice)) {
      await writeLock(voice, { pid: shellPid, reservedAt: new Date().toISOString() });
      return voice;
    }
  }

  return null; // All voices taken
}

export async function releaseVoice(voice?: string): Promise<boolean> {
  const target = voice?.toLowerCase() ?? process.env.TALKBACK_VOICE?.toLowerCase();

  if (!target || !VOICE_NAMES.includes(target)) {
    return false;
  }

  const lock = await readLock(target);
  if (!lock) return true; // Already free

  // Release if our shell owns it or the owner is dead
  const shellPid = process.ppid;
  if (lock.pid === shellPid || !isProcessAlive(lock.pid)) {
    await deleteLock(target);
    return true;
  }

  return false; // Someone else owns it
}

export async function getVoiceStatuses(): Promise<VoiceStatus[]> {
  await ensureLocksDir();

  const statuses: VoiceStatus[] = [];

  for (const voice of VOICE_NAMES) {
    const lock = await readLock(voice);

    if (!lock || !isProcessAlive(lock.pid)) {
      if (lock) await deleteLock(voice); // Cleanup stale
      statuses.push({ voice, available: true });
    } else {
      statuses.push({ voice, available: false, pid: lock.pid, since: lock.reservedAt });
    }
  }

  return statuses;
}

// --- Lock file operations ---

async function ensureLocksDir(): Promise<void> {
  if (!existsSync(LOCKS_DIR)) {
    await mkdir(LOCKS_DIR, { recursive: true });
  }
}

async function readLock(voice: string): Promise<LockFile | null> {
  try {
    const content = await readFile(join(LOCKS_DIR, `${voice}.lock`), "utf-8");
    return parseLockFile(content);
  } catch {
    // File doesn't exist or is corrupted - treat as no lock
    return null;
  }
}

async function writeLock(voice: string, data: LockFile): Promise<void> {
  await writeFile(join(LOCKS_DIR, `${voice}.lock`), JSON.stringify(data, null, 2));
}

async function deleteLock(voice: string): Promise<void> {
  try {
    await unlink(join(LOCKS_DIR, `${voice}.lock`));
  } catch {
    // Already deleted
  }
}

async function isAvailable(voice: string): Promise<boolean> {
  const lock = await readLock(voice);
  if (!lock) return true;
  if (!isProcessAlive(lock.pid)) {
    await deleteLock(voice);
    return true;
  }
  return false;
}

async function cleanupStaleLocks(): Promise<void> {
  for (const voice of VOICE_NAMES) {
    const lock = await readLock(voice);
    if (lock && !isProcessAlive(lock.pid)) {
      await deleteLock(voice);
    }
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 just checks if process exists
    return true;
  } catch {
    return false;
  }
}
