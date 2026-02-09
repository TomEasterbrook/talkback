/**
 * Local TTS fallback using system speech synthesizers.
 *
 * macOS: `say` command (built-in)
 * Linux: `espeak` or `espeak-ng`
 *
 * Used when:
 * - API is offline/unreachable
 * - Daily budget exceeded
 * - User explicitly prefers local TTS
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";

export type LocalTTSEngine = "say" | "espeak" | "espeak-ng" | null;

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
 */
export async function detectLocalEngine(): Promise<LocalTTSEngine> {
  const os = platform();

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
export async function speakLocal(
  text: string,
  options: LocalTTSOptions = {}
): Promise<void> {
  const engine = await detectLocalEngine();

  if (!engine) {
    const os = platform();
    const suggestion = os === "darwin"
      ? "The 'say' command should be available by default on macOS"
      : "Install espeak: apt install espeak-ng (Debian/Ubuntu) or dnf install espeak-ng (Fedora)";
    throw new Error(`No local TTS engine found. ${suggestion}`);
  }

  const { speed = "normal" } = options;

  if (engine === "say") {
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
    return os === "darwin"
      ? "Not available (say command not found)"
      : "Not available (install espeak-ng)";
  }

  const engineNames: Record<LocalTTSEngine & string, string> = {
    say: "macOS Say",
    espeak: "eSpeak",
    "espeak-ng": "eSpeak NG",
  };

  return `Available (${engineNames[engine]})`;
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
