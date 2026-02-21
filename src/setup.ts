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
import * as p from "@clack/prompts";
import { printBanner } from "./banner.js";
import { isApiKeyValid, textToSpeech } from "./api.js";
import { isSoxInstalled, playAudio } from "./player.js";
import {
  getAllVoices,
  setAccent,
  getDefaultVoice,
  type Accent,
  type VoiceGender,
} from "./voices.js";
import { parseConfig, defaultConfig, type Config } from "./validation.js";
import { TALKBACK_DIR, CONFIG_FILE, CONFIG_FILE_MODE, DIR_MODE } from "./constants.js";

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
    await mkdir(TALKBACK_DIR, { recursive: true, mode: DIR_MODE });
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

export async function getConfiguredDefaultVoice(): Promise<string> {
  const config = await loadConfig();
  return getDefaultVoice(config.voiceGender, config.defaultVoice);
}

// --- Setup wizard ---

export async function runSetup(): Promise<void> {
  printBanner();
  p.intro("Setup");

  // Check prerequisites
  const prereqSpinner = p.spinner();
  prereqSpinner.start("Checking prerequisites");

  const nodeVersion = process.versions.node;
  const majorVersion = parseInt(nodeVersion.split(".")[0], 10);
  if (majorVersion < 18) {
    prereqSpinner.stop("Prerequisites check failed");
    p.cancel(`Node.js 18+ required (you have ${nodeVersion})`);
    process.exit(1);
  }

  const soxInstalled = await isSoxInstalled();
  if (!soxInstalled) {
    prereqSpinner.stop("Prerequisites check failed");
    p.note(
      "Install sox:\n" +
        "  macOS:   brew install sox\n" +
        "  Linux:   apt install sox libsox-fmt-mp3\n" +
        "  Windows: choco install sox",
      "sox not found"
    );
    p.cancel("Please install sox and try again");
    process.exit(1);
  }

  prereqSpinner.stop(`Node.js ${nodeVersion} and sox installed`);

  const existingConfig = await loadConfig();

  // Voice preferences
  const accent = await p.select({
    message: "Voice accent",
    initialValue: existingConfig.accent ?? "us",
    options: [
      { value: "us", label: "US English", hint: "American accent" },
      { value: "british", label: "British English", hint: "UK accent" },
    ],
  });

  if (p.isCancel(accent)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }

  setAccent(accent as Accent);

  const voiceGender = await p.select({
    message: "Default voice",
    initialValue: existingConfig.voiceGender ?? "male",
    options: [
      { value: "male", label: "Alex", hint: "Male voice" },
      { value: "female", label: "Sam", hint: "Female voice" },
    ],
  });

  if (p.isCancel(voiceGender)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }

  // API key
  let apiKey: string;

  if (existingConfig.apiKey) {
    const masked = existingConfig.apiKey.slice(0, 8) + "..." + existingConfig.apiKey.slice(-4);
    const useExisting = await p.confirm({
      message: `Use existing API key? (${masked})`,
      initialValue: true,
    });

    if (p.isCancel(useExisting)) {
      p.cancel("Setup cancelled");
      process.exit(0);
    }

    if (useExisting) {
      apiKey = existingConfig.apiKey;
    } else {
      const newKey = await p.text({
        message: "Enter ElevenLabs API key",
        placeholder: "sk_...",
        validate: (value) => {
          if (!value?.trim()) return "API key is required";
        },
      });

      if (p.isCancel(newKey)) {
        p.cancel("Setup cancelled");
        process.exit(0);
      }

      apiKey = newKey.trim();
    }
  } else {
    p.note(
      "Get your API key at:\nhttps://elevenlabs.io/app/settings/api-keys",
      "ElevenLabs API key required"
    );

    const newKey = await p.text({
      message: "Enter API key",
      placeholder: "sk_...",
      validate: (value) => {
        if (!value?.trim()) return "API key is required";
      },
    });

    if (p.isCancel(newKey)) {
      p.cancel("Setup cancelled");
      process.exit(0);
    }

    apiKey = newKey.trim();
  }

  // Validate API key
  const validateSpinner = p.spinner();
  validateSpinner.start("Validating API key");

  const isValid = await isApiKeyValid(apiKey);
  if (!isValid) {
    validateSpinner.stop("Validation failed");
    p.cancel("Invalid API key");
    process.exit(1);
  }

  validateSpinner.stop("API key valid");

  // Save config
  await saveConfig({
    apiKey,
    accent: accent as Accent,
    voiceGender: voiceGender as VoiceGender,
  });

  p.log.success(`Config saved to ${CONFIG_FILE}`);

  // Test audio
  const testSpinner = p.spinner();
  testSpinner.start("Testing audio playback");

  try {
    const voice = getAllVoices()[getDefaultVoice(voiceGender as VoiceGender)];
    const audio = await textToSpeech(apiKey, {
      text: "Talkback is ready!",
      voiceId: voice.elevenLabsId,
    });
    await playAudio(audio);
    testSpinner.stop("Audio working");
  } catch (err) {
    testSpinner.stop("Audio test failed");
    p.log.warn(`Audio test failed: ${(err as Error).message}`);
  }

  p.outro("Setup complete! Try: talkback Hello world");
}
