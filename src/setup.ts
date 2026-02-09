/**
 * Setup wizard and configuration management.
 *
 * The setup command walks users through:
 * 1. Checking prerequisites (Node.js, sox)
 * 2. Choosing an accent (US or British)
 * 3. Entering their ElevenLabs API key
 * 4. Testing audio playback
 */

import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { isApiKeyValid, textToSpeech } from "./api.js";
import { isSoxInstalled, playAudio } from "./player.js";
import { getAllVoices, setAccent, DEFAULT_VOICE, type Accent } from "./voices.js";
import { parseConfig, defaultConfig, type Config } from "./validation.js";

const TALKBACK_DIR = join(homedir(), ".talkback");
const CONFIG_FILE = join(TALKBACK_DIR, "config.json");
const CONFIG_FILE_MODE = 0o600; // Owner read/write only

export type { Config };

// --- Config management ---

export async function loadConfig(): Promise<Config> {
  try {
    const content = await readFile(CONFIG_FILE, "utf-8");
    return parseConfig(content);
  } catch (err) {
    // File doesn't exist or is corrupted - return defaults
    if ((err as Error).message?.includes("Invalid config")) {
      console.error("Warning: Config file corrupted, using defaults");
    }
    return defaultConfig();
  }
}

export async function saveConfig(config: Config): Promise<void> {
  if (!existsSync(TALKBACK_DIR)) {
    await mkdir(TALKBACK_DIR, { recursive: true, mode: 0o700 });
  }
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: CONFIG_FILE_MODE });
  // Ensure permissions are correct even if file already existed
  await chmod(CONFIG_FILE, CONFIG_FILE_MODE);
}

export async function getApiKey(): Promise<string | null> {
  // Environment variable takes priority
  if (process.env.ELEVENLABS_API_KEY) {
    return process.env.ELEVENLABS_API_KEY;
  }
  const config = await loadConfig();
  return config.apiKey ?? null;
}

export async function loadSavedAccent(): Promise<void> {
  const config = await loadConfig();
  if (config.accent) {
    setAccent(config.accent);
  }
}

// --- Setup wizard ---

export async function runSetup(): Promise<void> {
  console.log("\n🎙️  Talkback Setup\n");

  // Check Node version
  const nodeVersion = process.versions.node;
  const majorVersion = parseInt(nodeVersion.split(".")[0], 10);
  if (majorVersion < 18) {
    console.log(`❌ Node.js 18+ required (you have ${nodeVersion})`);
    process.exit(1);
  }
  console.log(`✓ Node.js ${nodeVersion}`);

  // Check sox
  if (!(await isSoxInstalled())) {
    console.log("\n❌ sox not found");
    console.log("   Install with:");
    console.log("   - macOS:   brew install sox");
    console.log("   - Linux:   apt install sox libsox-fmt-mp3");
    console.log("   - Windows: choco install sox");
    process.exit(1);
  }
  console.log("✓ sox installed");

  const existingConfig = await loadConfig();

  // Choose accent
  console.log("\nVoice accent:");
  console.log("  1) US");
  console.log("  2) British\n");

  const defaultAccent = existingConfig.accent === "british" ? "2" : "1";
  const accentChoice = await prompt(`Choose [${defaultAccent}]: `);
  const accent: Accent = accentChoice.trim() === "2" ? "british" : "us";
  setAccent(accent);
  console.log(`✓ ${accent === "british" ? "British" : "US"} voices selected`);

  // Get API key
  console.log("\nElevenLabs API key required.");
  console.log("Get one at: https://elevenlabs.io/app/settings/api-keys\n");

  let apiKey: string;
  if (existingConfig.apiKey) {
    const masked = existingConfig.apiKey.slice(0, 8) + "..." + existingConfig.apiKey.slice(-4);
    const keepExisting = await prompt(`Use existing key (${masked})? [Y/n] `);
    apiKey = keepExisting.toLowerCase() === "n"
      ? await prompt("Enter API key: ")
      : existingConfig.apiKey;
  } else {
    apiKey = await prompt("Enter API key: ");
  }

  apiKey = apiKey.trim();
  if (!apiKey) {
    console.log("❌ API key required");
    process.exit(1);
  }

  // Validate
  console.log("\nValidating API key...");
  if (!(await isApiKeyValid(apiKey))) {
    console.log("❌ Invalid API key");
    process.exit(1);
  }
  console.log("✓ API key valid");

  // Save
  await saveConfig({ apiKey, accent });
  console.log(`✓ Config saved to ${CONFIG_FILE}`);

  // Test audio
  console.log("\nTesting audio...");
  try {
    const voice = getAllVoices()[DEFAULT_VOICE];
    const audio = await textToSpeech(apiKey, {
      text: "Talkback is ready!",
      voiceId: voice.elevenLabsId,
    });
    await playAudio(audio);
    console.log("✓ Audio working");
  } catch (err) {
    console.log(`⚠️  Audio test failed: ${(err as Error).message}`);
  }

  // Done
  console.log("\n" + "─".repeat(50));
  console.log("\n✅ Setup complete!\n");
  console.log("Try it: talkback Hello world\n");
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
