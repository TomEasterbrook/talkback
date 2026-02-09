/**
 * Sound themes for different audio aesthetics.
 *
 * Themes control the sound characteristics of beeps, signatures, and alerts.
 * Each theme provides a distinct audio personality.
 *
 * Available themes:
 * - default: Clean, professional sounds
 * - minimal: Subtle, quiet notifications
 * - retro: 8-bit style bleeps and bloops
 * - scifi: Futuristic, spaceship-like tones
 * - gentle: Soft, calm sounds
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TALKBACK_DIR } from "./constants.js";

const THEME_FILE = join(TALKBACK_DIR, "theme.json");

export type ThemeName = "default" | "minimal" | "retro" | "scifi" | "gentle";

export interface SoundSpec {
  // Sox synth parameters
  duration: number; // seconds
  waveform: "sine" | "square" | "sawtooth" | "triangle";
  frequency: string; // e.g., "500" or "500:900" for sweep
  volume: number; // 0.0 - 1.0
  fadeIn?: number;
  fadeOut?: number;
}

export interface Theme {
  name: ThemeName;
  displayName: string;
  description: string;
  successBeep: SoundSpec;
  errorBeep: SoundSpec;
  signatureBase: SoundSpec; // Base for voice signatures (frequency overridden)
}

// Theme definitions
const THEMES: Record<ThemeName, Theme> = {
  default: {
    name: "default",
    displayName: "Default",
    description: "Clean, professional sounds",
    successBeep: {
      duration: 0.15,
      waveform: "sine",
      frequency: "500:900",
      volume: 0.5,
    },
    errorBeep: {
      duration: 0.15,
      waveform: "sine",
      frequency: "500:300",
      volume: 0.5,
    },
    signatureBase: {
      duration: 0.08,
      waveform: "sine",
      frequency: "440",
      volume: 0.3,
      fadeIn: 0.01,
      fadeOut: 0.02,
    },
  },

  minimal: {
    name: "minimal",
    displayName: "Minimal",
    description: "Subtle, quiet notifications",
    successBeep: {
      duration: 0.08,
      waveform: "sine",
      frequency: "800",
      volume: 0.2,
      fadeIn: 0.01,
      fadeOut: 0.02,
    },
    errorBeep: {
      duration: 0.1,
      waveform: "sine",
      frequency: "400",
      volume: 0.25,
      fadeIn: 0.01,
      fadeOut: 0.02,
    },
    signatureBase: {
      duration: 0.05,
      waveform: "sine",
      frequency: "440",
      volume: 0.15,
      fadeIn: 0.01,
      fadeOut: 0.01,
    },
  },

  retro: {
    name: "retro",
    displayName: "Retro",
    description: "8-bit style bleeps and bloops",
    successBeep: {
      duration: 0.1,
      waveform: "square",
      frequency: "440:880",
      volume: 0.35,
    },
    errorBeep: {
      duration: 0.15,
      waveform: "square",
      frequency: "220:110",
      volume: 0.35,
    },
    signatureBase: {
      duration: 0.06,
      waveform: "square",
      frequency: "440",
      volume: 0.25,
    },
  },

  scifi: {
    name: "scifi",
    displayName: "Sci-Fi",
    description: "Futuristic, spaceship-like tones",
    successBeep: {
      duration: 0.2,
      waveform: "sine",
      frequency: "300:1200",
      volume: 0.4,
      fadeIn: 0.02,
      fadeOut: 0.05,
    },
    errorBeep: {
      duration: 0.25,
      waveform: "sawtooth",
      frequency: "400:150",
      volume: 0.35,
      fadeOut: 0.08,
    },
    signatureBase: {
      duration: 0.12,
      waveform: "sine",
      frequency: "440",
      volume: 0.3,
      fadeIn: 0.02,
      fadeOut: 0.04,
    },
  },

  gentle: {
    name: "gentle",
    displayName: "Gentle",
    description: "Soft, calm sounds",
    successBeep: {
      duration: 0.2,
      waveform: "sine",
      frequency: "600:700",
      volume: 0.25,
      fadeIn: 0.05,
      fadeOut: 0.08,
    },
    errorBeep: {
      duration: 0.25,
      waveform: "sine",
      frequency: "350:300",
      volume: 0.25,
      fadeIn: 0.05,
      fadeOut: 0.1,
    },
    signatureBase: {
      duration: 0.1,
      waveform: "sine",
      frequency: "440",
      volume: 0.2,
      fadeIn: 0.03,
      fadeOut: 0.04,
    },
  },
};

/**
 * Get the current theme.
 */
export async function getCurrentTheme(): Promise<Theme> {
  const themeName = await loadThemeName();
  return THEMES[themeName];
}

/**
 * Set the current theme.
 */
export async function setTheme(themeName: ThemeName): Promise<void> {
  if (!THEMES[themeName]) {
    throw new Error(`Unknown theme: ${themeName}`);
  }
  await saveThemeName(themeName);
}

/**
 * Get all available themes.
 */
export function getAllThemes(): Theme[] {
  return Object.values(THEMES);
}

/**
 * Get theme names.
 */
export function getThemeNames(): ThemeName[] {
  return Object.keys(THEMES) as ThemeName[];
}

/**
 * Check if a theme name is valid.
 */
export function isValidTheme(name: string): name is ThemeName {
  return name in THEMES;
}

/**
 * Convert a SoundSpec to sox play arguments.
 */
export function soundSpecToSoxArgs(spec: SoundSpec, frequencyOverride?: number): string[] {
  const args: string[] = ["-n", "synth", String(spec.duration), spec.waveform];

  // Use override frequency if provided, otherwise use spec frequency
  args.push(frequencyOverride ? String(frequencyOverride) : spec.frequency);

  // Add fade if specified
  if (spec.fadeIn || spec.fadeOut) {
    args.push("fade", "t");
    args.push(String(spec.fadeIn ?? 0));
    args.push(String(spec.duration));
    args.push(String(spec.fadeOut ?? 0));
  }

  // Add volume
  args.push("vol", String(spec.volume));

  return args;
}

// --- Internal helpers ---

async function ensureDir(): Promise<void> {
  if (!existsSync(TALKBACK_DIR)) {
    await mkdir(TALKBACK_DIR, { recursive: true });
  }
}

async function loadThemeName(): Promise<ThemeName> {
  try {
    const content = await readFile(THEME_FILE, "utf-8");
    const data = JSON.parse(content);
    if (typeof data.theme === "string" && isValidTheme(data.theme)) {
      return data.theme;
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return "default";
}

async function saveThemeName(themeName: ThemeName): Promise<void> {
  await ensureDir();
  await writeFile(THEME_FILE, JSON.stringify({ theme: themeName }, null, 2));
}
