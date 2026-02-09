/**
 * Shared constants and utilities used across the talkback codebase.
 *
 * Centralizes configuration values to avoid duplication and ensure consistency.
 */

import { join } from "node:path";
import { homedir } from "node:os";

// --- Paths ---

/** Base directory for talkback configuration and data */
export const TALKBACK_DIR = join(homedir(), ".talkback");

/** Cache directory for audio files */
export const CACHE_DIR = join(TALKBACK_DIR, "cache");

/** Locks directory for voice reservations */
export const LOCKS_DIR = join(TALKBACK_DIR, "locks");

/** Main config file path */
export const CONFIG_FILE = join(TALKBACK_DIR, "config.json");

/** Project-level config filename (placed in project root) */
export const PROJECT_CONFIG_FILE = ".talkback.json";

// --- File Permissions ---

/** Config file permissions: owner read/write only */
export const CONFIG_FILE_MODE = 0o600;

/** Directory permissions: owner only */
export const DIR_MODE = 0o700;

// --- API Settings ---

/** Default timeout for API requests (30 seconds) */
export const API_TIMEOUT_MS = 30000;

// --- Speech Settings ---

export type SpeechSpeed = "fast" | "normal" | "slow";

/** Speed multipliers for TTS providers */
export const SPEED_MULTIPLIERS: Record<SpeechSpeed, number> = {
  fast: 1.2,
  normal: 1.0,
  slow: 0.8,
};

/** Voice settings for whisper mode (soft, breathy voice) */
export interface WhisperSettings {
  stability: number;
  similarityBoost: number;
}

/**
 * Get voice settings adjusted for whisper mode.
 * Lower stability creates a breathier, softer sound.
 */
export function getWhisperSettings(whisper: boolean): WhisperSettings {
  return {
    stability: whisper ? 0.3 : 0.5,
    similarityBoost: whisper ? 0.5 : 0.75,
  };
}
