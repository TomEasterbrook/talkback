/**
 * Quiet hours management.
 *
 * Allows users to set time ranges when talkback should be silent.
 * Useful for meetings, focus time, or overnight.
 *
 * Examples:
 *   talkback quiet 9am-10am         # Single range
 *   talkback quiet 9-10,14-15       # Multiple ranges (24h format)
 *   talkback quiet off              # Disable quiet hours
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const TALKBACK_DIR = join(homedir(), ".talkback");
const QUIET_FILE = join(TALKBACK_DIR, "quiet.json");

export interface TimeRange {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export interface QuietConfig {
  enabled: boolean;
  ranges: TimeRange[];
}

/**
 * Check if we're currently in quiet hours.
 */
export async function isQuietTime(): Promise<boolean> {
  const config = await loadQuietConfig();
  if (!config.enabled || config.ranges.length === 0) {
    return false;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const range of config.ranges) {
    const startMinutes = range.startHour * 60 + range.startMinute;
    const endMinutes = range.endHour * 60 + range.endMinute;

    // Handle ranges that cross midnight
    if (startMinutes > endMinutes) {
      // e.g., 22:00 - 06:00
      if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
        return true;
      }
    } else {
      // Normal range, e.g., 09:00 - 10:00
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Parse time string into hour and minute.
 * Supports: "9am", "9:30am", "14:00", "2pm", "14", "9"
 */
function parseTime(timeStr: string): { hour: number; minute: number } | null {
  const str = timeStr.toLowerCase().trim();

  // Try 12-hour format with am/pm: "9am", "9:30pm"
  const ampmMatch = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const isPM = ampmMatch[3] === "pm";

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;

    return { hour, minute };
  }

  // Try 24-hour format: "14:00", "9:30"
  const hourMinMatch = str.match(/^(\d{1,2}):(\d{2})$/);
  if (hourMinMatch) {
    const hour = parseInt(hourMinMatch[1], 10);
    const minute = parseInt(hourMinMatch[2], 10);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    return { hour, minute };
  }

  // Try just hour: "14", "9"
  const hourMatch = str.match(/^(\d{1,2})$/);
  if (hourMatch) {
    const hour = parseInt(hourMatch[1], 10);
    if (hour < 0 || hour > 23) return null;
    return { hour, minute: 0 };
  }

  return null;
}

/**
 * Parse a time range string into a TimeRange.
 * Supports: "9am-10am", "9-10", "14:00-15:30"
 */
function parseTimeRange(rangeStr: string): TimeRange | null {
  const parts = rangeStr.split("-").map((s) => s.trim());
  if (parts.length !== 2) return null;

  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);

  if (!start || !end) return null;

  return {
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute,
  };
}

/**
 * Parse quiet hours input string.
 * Supports comma-separated ranges: "9am-10am,2pm-3pm"
 */
export function parseQuietHours(input: string): TimeRange[] {
  const ranges: TimeRange[] = [];

  const parts = input.split(",").map((s) => s.trim());
  for (const part of parts) {
    const range = parseTimeRange(part);
    if (range) {
      ranges.push(range);
    }
  }

  return ranges;
}

/**
 * Format a time range for display.
 */
function formatTimeRange(range: TimeRange): string {
  const formatTime = (hour: number, minute: number): string => {
    const h = hour.toString().padStart(2, "0");
    const m = minute.toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  return `${formatTime(range.startHour, range.startMinute)}-${formatTime(range.endHour, range.endMinute)}`;
}

/**
 * Set quiet hours.
 */
export async function setQuietHours(ranges: TimeRange[]): Promise<void> {
  await ensureDir();
  const config: QuietConfig = {
    enabled: ranges.length > 0,
    ranges,
  };
  await writeFile(QUIET_FILE, JSON.stringify(config, null, 2));
}

/**
 * Disable quiet hours.
 */
export async function disableQuietHours(): Promise<void> {
  await setQuietHours([]);
}

/**
 * Get current quiet hours configuration.
 */
export async function getQuietHours(): Promise<QuietConfig> {
  return loadQuietConfig();
}

/**
 * Format quiet hours status for display.
 */
export async function formatQuietStatus(): Promise<string> {
  const config = await loadQuietConfig();
  const inQuiet = await isQuietTime();

  if (!config.enabled || config.ranges.length === 0) {
    return "Quiet hours: disabled";
  }

  const rangeStrs = config.ranges.map(formatTimeRange);
  const status = inQuiet ? " (currently active)" : "";

  return `Quiet hours: ${rangeStrs.join(", ")}${status}`;
}

// --- Internal helpers ---

async function ensureDir(): Promise<void> {
  if (!existsSync(TALKBACK_DIR)) {
    await mkdir(TALKBACK_DIR, { recursive: true });
  }
}

async function loadQuietConfig(): Promise<QuietConfig> {
  try {
    const content = await readFile(QUIET_FILE, "utf-8");
    const data = JSON.parse(content);

    if (typeof data.enabled === "boolean" && Array.isArray(data.ranges)) {
      return data as QuietConfig;
    }
  } catch {
    // File doesn't exist or is invalid
  }

  return { enabled: false, ranges: [] };
}
