/**
 * JSON schema validation for configuration and data files.
 *
 * Provides type guards and validators to ensure JSON files have the
 * expected structure before use, preventing silent failures from
 * corrupted or malformed data.
 */

import type { SpeechSpeed } from "./api.js";

// --- Config validation ---

export type ProviderName = "elevenlabs" | "openai" | "azure" | "aws" | "google";

export interface ProviderCredentials {
  elevenlabs?: { apiKey: string };
  openai?: { apiKey: string };
  azure?: { apiKey: string; region: string };
  aws?: { accessKeyId: string; secretAccessKey: string; region: string };
  google?: { apiKey: string };
}

export interface Config {
  apiKey?: string; // Legacy: ElevenLabs API key
  accent?: "us" | "british";
  voiceGender?: "male" | "female"; // Preferred gender for default voice
  defaultVoice?: string; // Specific default voice name (overrides voiceGender)
  localFallback?: boolean; // Use local TTS when API fails or budget exceeded
  provider?: ProviderName; // Active TTS provider
  providers?: ProviderCredentials; // Provider-specific credentials
  piperVoice?: string; // Preferred Piper voice for local TTS fallback
}

const VALID_PROVIDERS: ProviderName[] = ["elevenlabs", "openai", "azure", "aws", "google"];

export function isValidConfig(data: unknown): data is Config {
  if (typeof data !== "object" || data === null) return false;

  const obj = data as Record<string, unknown>;

  if (obj.apiKey !== undefined && typeof obj.apiKey !== "string") return false;
  if (obj.accent !== undefined && obj.accent !== "us" && obj.accent !== "british") return false;
  if (obj.voiceGender !== undefined && obj.voiceGender !== "male" && obj.voiceGender !== "female")
    return false;
  if (obj.defaultVoice !== undefined && typeof obj.defaultVoice !== "string") return false;
  if (obj.localFallback !== undefined && typeof obj.localFallback !== "boolean") return false;
  if (obj.provider !== undefined && !VALID_PROVIDERS.includes(obj.provider as ProviderName))
    return false;
  if (obj.providers !== undefined && typeof obj.providers !== "object") return false;
  if (obj.piperVoice !== undefined && typeof obj.piperVoice !== "string") return false;

  return true;
}

export function parseConfig(content: string): Config {
  const data = JSON.parse(content);
  if (!isValidConfig(data)) {
    throw new Error("Invalid config file format");
  }
  return data;
}

// --- Queue message validation ---

export type Priority = "critical" | "high" | "normal" | "low";

export interface Message {
  text: string;
  voiceId: string;
  voiceName: string;
  speed: SpeechSpeed;
  queuedAt: string;
  priority?: Priority;
  whisper?: boolean;
}

const VALID_PRIORITIES: Priority[] = ["critical", "high", "normal", "low"];

function isValidSpeechSpeed(value: unknown): value is SpeechSpeed {
  return value === "fast" || value === "normal" || value === "slow";
}

function isValidPriority(value: unknown): value is Priority {
  return VALID_PRIORITIES.includes(value as Priority);
}

function isValidMessage(data: unknown): data is Message {
  if (typeof data !== "object" || data === null) return false;

  const obj = data as Record<string, unknown>;

  // Check optional priority field
  if (obj.priority !== undefined && !isValidPriority(obj.priority)) return false;

  // Check optional whisper field
  if (obj.whisper !== undefined && typeof obj.whisper !== "boolean") return false;

  return (
    typeof obj.text === "string" &&
    typeof obj.voiceId === "string" &&
    typeof obj.voiceName === "string" &&
    isValidSpeechSpeed(obj.speed) &&
    typeof obj.queuedAt === "string"
  );
}

export function isValidMessageQueue(data: unknown): data is Message[] {
  if (!Array.isArray(data)) return false;
  return data.every(isValidMessage);
}

export function parseMessageQueue(content: string): Message[] {
  const data = JSON.parse(content);
  if (!isValidMessageQueue(data)) {
    throw new Error("Invalid queue file format");
  }
  return data;
}

// --- Stats validation ---

export interface DailyUsage {
  date: string;
  characters: number;
  messages: number;
  warnedThresholds?: number[]; // Percentages already warned about (e.g., [75, 90])
}

export interface Stats {
  totalCharacters: number;
  totalMessages: number;
  dailyUsage: DailyUsage[];
  dailyBudget?: number;
}

function isValidDailyUsage(data: unknown): data is DailyUsage {
  if (typeof data !== "object" || data === null) return false;

  const obj = data as Record<string, unknown>;

  // Check required fields
  if (typeof obj.date !== "string") return false;
  if (typeof obj.characters !== "number") return false;
  if (typeof obj.messages !== "number") return false;

  // Check optional warnedThresholds
  if (obj.warnedThresholds !== undefined) {
    if (!Array.isArray(obj.warnedThresholds)) return false;
    if (!obj.warnedThresholds.every((t) => typeof t === "number")) return false;
  }

  return true;
}

export function isValidStats(data: unknown): data is Stats {
  if (typeof data !== "object" || data === null) return false;

  const obj = data as Record<string, unknown>;

  // Check required fields
  if (typeof obj.totalCharacters !== "number") return false;
  if (typeof obj.totalMessages !== "number") return false;
  if (!Array.isArray(obj.dailyUsage)) return false;
  if (!obj.dailyUsage.every(isValidDailyUsage)) return false;

  // Check optional field
  if (obj.dailyBudget !== undefined && typeof obj.dailyBudget !== "number") return false;

  return true;
}

// Handle legacy format migration
interface LegacyStats {
  total?: { characters?: number; messages?: number };
  daily?: DailyUsage[];
  budget?: { dailyLimit?: number };
}

function isLegacyStats(data: unknown): data is LegacyStats {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return obj.total !== undefined || obj.daily !== undefined || obj.budget !== undefined;
}

export function parseStats(content: string): Stats {
  const data = JSON.parse(content);

  // Handle legacy format
  if (isLegacyStats(data) && !isValidStats(data)) {
    const legacy = data as LegacyStats;
    return {
      totalCharacters: legacy.total?.characters ?? 0,
      totalMessages: legacy.total?.messages ?? 0,
      dailyUsage: legacy.daily ?? [],
      dailyBudget: legacy.budget?.dailyLimit,
    };
  }

  if (!isValidStats(data)) {
    throw new Error("Invalid stats file format");
  }
  return data;
}

// --- Lock file validation ---

export interface LockFile {
  pid: number;
  reservedAt: string;
}

export function isValidLockFile(data: unknown): data is LockFile {
  if (typeof data !== "object" || data === null) return false;

  const obj = data as Record<string, unknown>;

  return typeof obj.pid === "number" && typeof obj.reservedAt === "string";
}

export function parseLockFile(content: string): LockFile {
  const data = JSON.parse(content);
  if (!isValidLockFile(data)) {
    throw new Error("Invalid lock file format");
  }
  return data;
}

// --- Default values for corrupted files ---

export function defaultConfig(): Config {
  return {};
}

export function defaultMessageQueue(): Message[] {
  return [];
}

export function defaultStats(): Stats {
  return { totalCharacters: 0, totalMessages: 0, dailyUsage: [] };
}
