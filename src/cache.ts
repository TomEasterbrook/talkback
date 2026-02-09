/**
 * Audio caching for frequently used phrases.
 *
 * Caches TTS audio files locally to reduce API calls and latency.
 * Cache key is derived from text + voiceId + speed.
 *
 * Storage: ~/.talkback/cache/
 * Format: {hash}.mp3
 */

import { readFile, writeFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import type { SpeechSpeed } from "./api.js";

const CACHE_DIR = join(homedir(), ".talkback", "cache");
const MAX_CACHE_SIZE_MB = 50; // Max cache size in MB
const MAX_CACHE_AGE_DAYS = 30; // Max age of cached files

export interface CacheKey {
  text: string;
  voiceId: string;
  speed: SpeechSpeed;
}

/**
 * Generate a cache key hash from the speech parameters.
 */
function getCacheHash(key: CacheKey): string {
  const data = `${key.text}|${key.voiceId}|${key.speed}`;
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

/**
 * Get the file path for a cache entry.
 */
function getCachePath(key: CacheKey): string {
  return join(CACHE_DIR, `${getCacheHash(key)}.mp3`);
}

/**
 * Check if audio is cached for the given parameters.
 */
export async function isCached(key: CacheKey): Promise<boolean> {
  const path = getCachePath(key);
  return existsSync(path);
}

/**
 * Get cached audio if available.
 */
export async function getFromCache(key: CacheKey): Promise<Buffer | null> {
  const path = getCachePath(key);

  try {
    const audio = await readFile(path);
    // Touch the file to update mtime for LRU
    await writeFile(path, audio);
    return audio;
  } catch {
    return null;
  }
}

/**
 * Store audio in the cache.
 */
export async function saveToCache(key: CacheKey, audio: Buffer): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }

  const path = getCachePath(key);
  await writeFile(path, audio);

  // Run cleanup in background (don't await)
  cleanupCache().catch(() => {});
}

/**
 * Clear the entire cache.
 */
export async function clearCache(): Promise<number> {
  if (!existsSync(CACHE_DIR)) {
    return 0;
  }

  const files = await readdir(CACHE_DIR);
  let count = 0;

  for (const file of files) {
    if (file.endsWith(".mp3")) {
      try {
        await unlink(join(CACHE_DIR, file));
        count++;
      } catch {
        // Ignore errors
      }
    }
  }

  return count;
}

/**
 * Get cache statistics.
 */
export async function getCacheStats(): Promise<{
  entries: number;
  sizeBytes: number;
  sizeMB: string;
}> {
  if (!existsSync(CACHE_DIR)) {
    return { entries: 0, sizeBytes: 0, sizeMB: "0.00" };
  }

  const files = await readdir(CACHE_DIR);
  let totalSize = 0;
  let count = 0;

  for (const file of files) {
    if (file.endsWith(".mp3")) {
      try {
        const fileStat = await stat(join(CACHE_DIR, file));
        totalSize += fileStat.size;
        count++;
      } catch {
        // Ignore errors
      }
    }
  }

  return {
    entries: count,
    sizeBytes: totalSize,
    sizeMB: (totalSize / 1024 / 1024).toFixed(2),
  };
}

/**
 * Clean up old and excess cache files.
 */
async function cleanupCache(): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    return;
  }

  const files = await readdir(CACHE_DIR);
  const now = Date.now();
  const maxAge = MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000;

  interface FileInfo {
    name: string;
    path: string;
    mtime: number;
    size: number;
  }

  const fileInfos: FileInfo[] = [];

  // Gather file info
  for (const file of files) {
    if (!file.endsWith(".mp3")) continue;

    const path = join(CACHE_DIR, file);
    try {
      const fileStat = await stat(path);
      fileInfos.push({
        name: file,
        path,
        mtime: fileStat.mtimeMs,
        size: fileStat.size,
      });
    } catch {
      // Ignore errors
    }
  }

  // Delete files older than max age
  for (const info of fileInfos) {
    if (now - info.mtime > maxAge) {
      try {
        await unlink(info.path);
      } catch {
        // Ignore errors
      }
    }
  }

  // Check total size and delete oldest if over limit
  let totalSize = fileInfos.reduce((sum, f) => sum + f.size, 0);
  const maxSize = MAX_CACHE_SIZE_MB * 1024 * 1024;

  if (totalSize > maxSize) {
    // Sort by mtime (oldest first)
    fileInfos.sort((a, b) => a.mtime - b.mtime);

    for (const info of fileInfos) {
      if (totalSize <= maxSize) break;

      try {
        await unlink(info.path);
        totalSize -= info.size;
      } catch {
        // Ignore errors
      }
    }
  }
}
