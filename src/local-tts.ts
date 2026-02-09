/**
 * Local TTS fallback using system speech synthesizers.
 *
 * Supported engines (in order of preference):
 * - Piper: High-quality neural TTS (cross-platform, free)
 * - macOS say: Built-in macOS speech (robotic but reliable)
 * - espeak-ng/espeak: Linux speech synthesis (robotic)
 *
 * Used when:
 * - API is offline/unreachable
 * - Daily budget exceeded
 * - User explicitly prefers local TTS
 */

import { spawn } from "node:child_process";
import { platform, homedir } from "node:os";
import { existsSync } from "node:fs";
import { readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { TALKBACK_DIR } from "./constants.js";

export type LocalTTSEngine = "piper" | "say" | "espeak" | "espeak-ng" | null;

const PIPER_VOICES_DIR = join(TALKBACK_DIR, "piper");
const PIPER_DEFAULT_VOICE = "en_US-lessac-medium";

// Available Piper voices (curated list of quality voices)
export const PIPER_VOICE_CATALOG: Record<string, { url: string; description: string }> = {
  // US voices
  "en_US-lessac-medium": {
    url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium",
    description: "US female (default)",
  },
  "en_US-ryan-medium": {
    url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium",
    description: "US male",
  },
  // British voices
  "en_GB-alba-medium": {
    url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium",
    description: "Scottish female",
  },
  "en_GB-aru-medium": {
    url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/aru/medium",
    description: "British male",
  },
  "en_GB-cori-medium": {
    url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/medium",
    description: "British female",
  },
  "en_GB-northern_english_male-medium": {
    url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/northern_english_male/medium",
    description: "Northern English male",
  },
  "en_GB-southern_english_female-medium": {
    url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/southern_english_female/medium",
    description: "Southern English female",
  },
};

interface LocalTTSOptions {
  speed?: "fast" | "normal" | "slow";
}

// Speed mappings for each engine
const SAY_RATES: Record<string, number> = {
  fast: 220,
  normal: 175,
  slow: 140,
};

const ESPEAK_RATES: Record<string, number> = {
  fast: 200,
  normal: 160,
  slow: 120,
};

/**
 * Detect which local TTS engine is available.
 * Prefers Piper (neural quality) over system TTS (robotic).
 */
export async function detectLocalEngine(): Promise<LocalTTSEngine> {
  const os = platform();

  // Prefer Piper if available (best quality)
  if (await commandExists("piper") && await hasPiperVoice()) {
    return "piper";
  }

  if (os === "darwin") {
    // macOS always has `say`
    if (await commandExists("say")) {
      return "say";
    }
  }

  // Linux: try espeak-ng first (newer), then espeak
  if (await commandExists("espeak-ng")) {
    return "espeak-ng";
  }
  if (await commandExists("espeak")) {
    return "espeak";
  }

  return null;
}

/**
 * Speak text using the local TTS engine.
 */
export async function speakLocal(text: string, options: LocalTTSOptions = {}): Promise<void> {
  const engine = await detectLocalEngine();

  if (!engine) {
    const os = platform();
    const suggestion =
      os === "darwin"
        ? "The 'say' command should be available by default on macOS"
        : "Install espeak: apt install espeak-ng (Debian/Ubuntu) or dnf install espeak-ng (Fedora)";
    throw new Error(`No local TTS engine found. ${suggestion}`);
  }

  const { speed = "normal" } = options;

  if (engine === "piper") {
    await runPiper(text, speed);
  } else if (engine === "say") {
    await runSay(text, speed);
  } else {
    await runEspeak(engine, text, speed);
  }
}

/**
 * Check if local TTS is available on this system.
 */
export async function isLocalTTSAvailable(): Promise<boolean> {
  return (await detectLocalEngine()) !== null;
}

/**
 * Get a human-readable description of the local TTS status.
 */
export async function getLocalTTSStatus(): Promise<string> {
  const engine = await detectLocalEngine();

  if (!engine) {
    const os = platform();
    // Check if piper is installed but missing a voice
    if (await commandExists("piper")) {
      return "Piper installed but no voice model. Run: talkback piper install";
    }
    return os === "darwin"
      ? "Not available (say command not found)"
      : "Not available (install espeak-ng)";
  }

  const engineNames: Record<LocalTTSEngine & string, string> = {
    piper: "Piper (neural)",
    say: "macOS Say",
    espeak: "eSpeak",
    "espeak-ng": "eSpeak NG",
  };

  return `Available (${engineNames[engine]})`;
}

/**
 * Check if Piper is available (binary + voice model).
 */
export async function isPiperAvailable(): Promise<boolean> {
  return (await commandExists("piper")) && (await hasPiperVoice());
}

/**
 * Get info about Piper installation status.
 */
export async function getPiperStatus(): Promise<{
  installed: boolean;
  hasVoice: boolean;
  voicePath: string | null;
}> {
  const installed = await commandExists("piper");
  const voicePath = await findPiperVoice();
  return {
    installed,
    hasVoice: voicePath !== null,
    voicePath,
  };
}

/**
 * Download a Piper voice model.
 */
export async function downloadPiperVoice(
  voiceName: string = PIPER_DEFAULT_VOICE
): Promise<string> {
  // Ensure voices directory exists
  if (!existsSync(PIPER_VOICES_DIR)) {
    await mkdir(PIPER_VOICES_DIR, { recursive: true });
  }

  const voiceInfo = PIPER_VOICE_CATALOG[voiceName];
  if (!voiceInfo) {
    const available = Object.keys(PIPER_VOICE_CATALOG).join(", ");
    throw new Error(`Unknown voice: ${voiceName}. Available: ${available}`);
  }

  const modelFile = join(PIPER_VOICES_DIR, `${voiceName}.onnx`);
  const configFile = join(PIPER_VOICES_DIR, `${voiceName}.onnx.json`);

  // Check if already downloaded
  if (existsSync(modelFile) && existsSync(configFile)) {
    console.log(`Voice already installed: ${voiceName}`);
    return modelFile;
  }

  // Download from Hugging Face
  const baseUrl = voiceInfo.url;
  const modelUrl = `${baseUrl}/${voiceName}.onnx?download=true`;
  const configUrl = `${baseUrl}/${voiceName}.onnx.json?download=true`;

  console.log(`Downloading Piper voice: ${voiceName} (${voiceInfo.description})...`);

  // Download model file
  await downloadFile(modelUrl, modelFile);
  console.log("  Downloaded model file");

  // Download config file
  await downloadFile(configUrl, configFile);
  console.log("  Downloaded config file");

  console.log(`Voice installed to: ${modelFile}`);
  return modelFile;
}

/**
 * Get available Piper voices from catalog.
 */
export function getPiperVoiceCatalog(): { name: string; description: string }[] {
  return Object.entries(PIPER_VOICE_CATALOG).map(([name, info]) => ({
    name,
    description: info.description,
  }));
}

/**
 * List available Piper voices (downloaded locally).
 */
export async function listPiperVoices(): Promise<string[]> {
  if (!existsSync(PIPER_VOICES_DIR)) {
    return [];
  }

  const files = await readdir(PIPER_VOICES_DIR);
  return files
    .filter((f) => f.endsWith(".onnx") && !f.endsWith(".onnx.json"))
    .map((f) => f.replace(".onnx", ""));
}

// --- Private helpers ---

async function runSay(text: string, speed: string): Promise<void> {
  const rate = SAY_RATES[speed] ?? SAY_RATES.normal;

  return new Promise((resolve, reject) => {
    const proc = spawn("say", ["-r", String(rate), text], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    proc.stderr?.on("data", (chunk) => (stderr += chunk));

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`say exited with code ${code}: ${stderr}`));
      }
    });
  });
}

async function runEspeak(
  engine: "espeak" | "espeak-ng",
  text: string,
  speed: string
): Promise<void> {
  const rate = ESPEAK_RATES[speed] ?? ESPEAK_RATES.normal;

  return new Promise((resolve, reject) => {
    const proc = spawn(engine, ["-s", String(rate), text], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    proc.stderr?.on("data", (chunk) => (stderr += chunk));

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${engine} exited with code ${code}: ${stderr}`));
      }
    });
  });
}

function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("which", [cmd], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

// --- Piper helpers ---

// Speed settings for Piper (length_scale: lower = faster)
const PIPER_SPEEDS: Record<string, number> = {
  fast: 0.8,
  normal: 1.0,
  slow: 1.3,
};

// Track the preferred voice (set when installing or loaded from config)
let preferredPiperVoice: string | null = null;

/**
 * Set the preferred Piper voice to use.
 */
export function setPreferredPiperVoice(voiceName: string | undefined): void {
  preferredPiperVoice = voiceName ?? null;
}

/**
 * Get the current preferred Piper voice.
 */
export function getPreferredPiperVoice(): string | null {
  return preferredPiperVoice;
}

async function hasPiperVoice(): Promise<boolean> {
  return (await findPiperVoice()) !== null;
}

async function findPiperVoice(): Promise<string | null> {
  if (!existsSync(PIPER_VOICES_DIR)) {
    return null;
  }

  try {
    const files = await readdir(PIPER_VOICES_DIR);
    const onnxFiles = files.filter((f) => f.endsWith(".onnx") && !f.endsWith(".onnx.json"));

    if (onnxFiles.length === 0) {
      return null;
    }

    // Prefer the explicitly set voice
    if (preferredPiperVoice) {
      const preferred = `${preferredPiperVoice}.onnx`;
      if (onnxFiles.includes(preferred)) {
        return join(PIPER_VOICES_DIR, preferred);
      }
    }

    // Otherwise use first available (sorted for consistency)
    onnxFiles.sort();
    return join(PIPER_VOICES_DIR, onnxFiles[0]);
  } catch {
    // Directory doesn't exist or can't be read
  }

  return null;
}

async function runPiper(text: string, speed: string): Promise<void> {
  const voicePath = await findPiperVoice();
  if (!voicePath) {
    throw new Error("No Piper voice model found. Run: talkback piper install");
  }

  const lengthScale = PIPER_SPEEDS[speed] ?? PIPER_SPEEDS.normal;

  return new Promise((resolve, reject) => {
    // Piper outputs raw audio, pipe through sox play
    const piper = spawn("piper", [
      "--model", voicePath,
      "--length_scale", String(lengthScale),
      "--output-raw",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Play raw audio with sox (22050 Hz, 16-bit signed, mono)
    const play = spawn("play", [
      "-t", "raw",
      "-r", "22050",
      "-e", "signed",
      "-b", "16",
      "-c", "1",
      "-",
    ], {
      stdio: ["pipe", "ignore", "pipe"],
    });

    // Pipe piper output to play input
    piper.stdout.pipe(play.stdin);

    // Send text to piper
    piper.stdin.write(text);
    piper.stdin.end();

    let piperErr = "";
    let playErr = "";

    piper.stderr?.on("data", (chunk) => (piperErr += chunk));
    play.stderr?.on("data", (chunk) => (playErr += chunk));

    piper.on("error", (err) => reject(new Error(`Piper error: ${err.message}`)));
    play.on("error", (err) => reject(new Error(`Play error: ${err.message}`)));

    play.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Playback failed: ${playErr || piperErr}`));
      }
    });
  });
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const { writeFile } = await import("node:fs/promises");
  await writeFile(destPath, buffer);
}
