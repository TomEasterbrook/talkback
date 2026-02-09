/**
 * Usage statistics and budget tracking.
 *
 * Tracks characters spoken and estimated cost. Optionally enforces
 * a daily character budget to prevent runaway costs.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseStats, defaultStats, type Stats, type DailyUsage } from "./validation.js";

const TALKBACK_DIR = join(homedir(), ".talkback");
const STATS_FILE = join(TALKBACK_DIR, "stats.json");

// ElevenLabs Turbo v2.5: ~$0.15 per 1000 characters
const COST_PER_CHARACTER = 0.00015;

// --- Public API ---

export async function recordUsage(characters: number): Promise<void> {
  const stats = await load();
  const today = getToday(stats);

  stats.totalCharacters += characters;
  stats.totalMessages += 1;
  today.characters += characters;
  today.messages += 1;

  await save(stats);
}

export async function checkBudget(
  characters: number
): Promise<{ allowed: boolean; remaining: number }> {
  const stats = await load();

  if (!stats.dailyBudget) {
    return { allowed: true, remaining: Infinity };
  }

  const today = getToday(stats);
  const remaining = stats.dailyBudget - today.characters;

  return {
    allowed: remaining >= characters,
    remaining: Math.max(0, remaining),
  };
}

export async function setBudget(limit: number | null): Promise<void> {
  const stats = await load();
  stats.dailyBudget = limit ?? undefined;
  await save(stats);
}

// Warning thresholds (percentages)
const WARNING_THRESHOLDS = [75, 90, 95];

/**
 * Check if any budget warning thresholds have been crossed.
 * Returns thresholds that need warnings (not yet warned about today).
 * Marks those thresholds as warned.
 */
export async function checkWarningThresholds(): Promise<number[]> {
  const stats = await load();

  if (!stats.dailyBudget) {
    return [];
  }

  const today = getToday(stats);
  const usedPercent = (today.characters / stats.dailyBudget) * 100;
  const warnedThresholds = today.warnedThresholds ?? [];

  // Find thresholds we've crossed but haven't warned about
  const newWarnings = WARNING_THRESHOLDS.filter(
    (threshold) => usedPercent >= threshold && !warnedThresholds.includes(threshold)
  );

  if (newWarnings.length > 0) {
    // Mark these thresholds as warned
    today.warnedThresholds = [...warnedThresholds, ...newWarnings];
    await save(stats);
  }

  return newWarnings;
}

/**
 * Get current budget usage percentage.
 */
export async function getBudgetUsage(): Promise<{ percent: number; remaining: number } | null> {
  const stats = await load();

  if (!stats.dailyBudget) {
    return null;
  }

  const today = getToday(stats);
  const remaining = stats.dailyBudget - today.characters;
  const percent = (today.characters / stats.dailyBudget) * 100;

  return { percent, remaining: Math.max(0, remaining) };
}

export async function formatStats(): Promise<string> {
  const stats = await load();
  const today = getToday(stats);

  const todayCost = (today.characters * COST_PER_CHARACTER).toFixed(4);
  const totalCost = (stats.totalCharacters * COST_PER_CHARACTER).toFixed(4);

  let output = `
Talkback Usage Stats

Today:
  Messages:   ${today.messages}
  Characters: ${today.characters.toLocaleString()}
  Est. cost:  $${todayCost}

All time:
  Messages:   ${stats.totalMessages.toLocaleString()}
  Characters: ${stats.totalCharacters.toLocaleString()}
  Est. cost:  $${totalCost}
`;

  if (stats.dailyBudget) {
    const remaining = stats.dailyBudget - today.characters;
    const usedPercent = ((today.characters / stats.dailyBudget) * 100).toFixed(1);
    output += `
Budget:
  Daily limit: ${stats.dailyBudget.toLocaleString()} chars
  Used today:  ${usedPercent}%
  Remaining:   ${Math.max(0, remaining).toLocaleString()} chars
`;
  } else {
    output += `
Budget: No limit set
  Set with: talkback stats --budget <chars>
`;
  }

  return output;
}

// --- Storage ---

async function load(): Promise<Stats> {
  try {
    const content = await readFile(STATS_FILE, "utf-8");
    return parseStats(content);
  } catch (err) {
    // File doesn't exist or is corrupted - return defaults
    if ((err as Error).message?.includes("Invalid stats")) {
      console.error("Warning: Stats file corrupted, resetting stats");
    }
    return defaultStats();
  }
}

async function save(stats: Stats): Promise<void> {
  if (!existsSync(TALKBACK_DIR)) {
    await mkdir(TALKBACK_DIR, { recursive: true });
  }
  await writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
}

function getToday(stats: Stats): DailyUsage {
  const date = new Date().toISOString().split("T")[0];
  let today = stats.dailyUsage.find((d) => d.date === date);

  if (!today) {
    today = { date, characters: 0, messages: 0 };
    stats.dailyUsage.push(today);

    // Keep only last 30 days
    if (stats.dailyUsage.length > 30) {
      stats.dailyUsage = stats.dailyUsage.slice(-30);
    }
  }

  return today;
}
