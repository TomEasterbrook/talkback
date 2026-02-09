#!/usr/bin/env node

/**
 * Talkback - Voice for agentic coders
 *
 * A CLI tool that speaks text using ElevenLabs text-to-speech.
 * Designed for AI coding assistants running in terminals.
 */

import { Command } from "commander";
import { spawn } from "node:child_process";
import { textToSpeech, type SpeechSpeed } from "./api.js";
import { playAudio, playBeep, playVoiceSignature } from "./player.js";
import { processForSpeech, detectSentiment } from "./text.js";
import {
  getVoice,
  getVoiceDisplayName,
  getAllVoices,
  getAccent,
  DEFAULT_VOICE,
  VOICE_NAMES,
} from "./voices.js";
import { reserveVoice, releaseVoice, getVoiceStatuses } from "./locks.js";
import {
  addToQueue,
  takeFromQueue,
  acquirePlaybackLock,
  releasePlaybackLock,
  type Message,
} from "./queue.js";
import { runSetup, getApiKey, loadSavedAccent, loadConfig } from "./setup.js";
import {
  recordUsage,
  checkBudget,
  setBudget,
  formatStats,
  checkWarningThresholds,
  getBudgetUsage,
} from "./stats.js";
import { installHooks, uninstallHooks, showHooksStatus } from "./git.js";
import { speakLocal, isLocalTTSAvailable, getLocalTTSStatus } from "./local-tts.js";
import { getFromCache, saveToCache, clearCache, getCacheStats, type CacheKey } from "./cache.js";
import { createProvider, getProviderNames, type ProviderName } from "./providers.js";
import { summarizeText, isSummarizationAvailable, getSummaryProviderName } from "./summarize.js";
import {
  isQuietTime,
  parseQuietHours,
  setQuietHours,
  disableQuietHours,
  formatQuietStatus,
} from "./quiet.js";
import {
  getCurrentTheme,
  setTheme,
  getAllThemes,
  getThemeNames,
  isValidTheme,
} from "./themes.js";

// --- CLI Options Interface ---

import type { Priority } from "./validation.js";

interface SpeakOptions {
  voice?: string;
  speed: SpeechSpeed;
  maxLength: number;
  beep?: "success" | "error";
  local: boolean;
  signature?: boolean; // --no-signature sets this to false
  summarize?: boolean; // AI-summarize long messages
  priority?: Priority; // Message priority (critical, high, normal, low)
}

interface StatsOptions {
  budget?: string;
}

// --- Commands ---

function showVoices(): void {
  const voices = getAllVoices();
  const accent = getAccent();

  console.log(`\nAvailable voices (${accent === "british" ? "British" : "US"}):\n`);
  for (const [key, voice] of Object.entries(voices)) {
    const marker = key === DEFAULT_VOICE ? " (default)" : "";
    console.log(`  ${voice.name.padEnd(8)} ${voice.description}${marker}`);
  }
  console.log("\nChange accent: talkback setup\n");
}

async function showStatus(): Promise<void> {
  const statuses = await getVoiceStatuses();

  console.log("\nVoice reservations:\n");
  for (const s of statuses) {
    const name = getVoiceDisplayName(s.voice);
    const status = s.available ? "✓ available" : `🔒 reserved (PID ${s.pid})`;
    console.log(`  ${name.padEnd(8)} ${status}`);
  }
  console.log();
}

async function handleReserve(announce: boolean = true): Promise<void> {
  const voiceName = await reserveVoice();
  if (!voiceName) {
    console.error("All voices are currently reserved");
    process.exit(1);
  }

  console.log(voiceName); // Just the name, for: export TALKBACK_VOICE=$(talkback reserve)

  // Announce the voice is online
  if (announce) {
    const apiKey = await getApiKey();
    if (apiKey) {
      const voice = getVoice(voiceName);
      if (voice) {
        try {
          const audio = await textToSpeech(apiKey, {
            text: `${voice.name} is online`,
            voiceId: voice.elevenLabsId,
          });
          await playAudio(audio);
          await recordUsage(`${voice.name} is online`.length);
        } catch {
          // Silently fail - announcement is optional
        }
      }
    }
  }
}

async function handleRelease(voiceName?: string): Promise<void> {
  if (await releaseVoice(voiceName)) {
    console.log("Voice released");
  } else {
    console.error("Could not release voice");
    process.exit(1);
  }
}

async function handleStats(options: StatsOptions): Promise<void> {
  if (options.budget) {
    if (options.budget === "none" || options.budget === "off") {
      await setBudget(null);
      console.log("Budget removed");
    } else {
      const budget = parseInt(options.budget, 10);
      if (budget > 0) {
        await setBudget(budget);
        console.log(`Daily budget set to ${budget.toLocaleString()} characters`);
      }
    }
  } else {
    console.log(await formatStats());
  }
}

async function handleGit(subcommand?: string): Promise<void> {
  switch (subcommand) {
    case "install": {
      const installed = await installHooks();
      if (installed.length > 0) {
        console.log(`Installed hooks: ${installed.join(", ")}`);
        console.log("\nGit will now announce commits, branch switches, and pushes.");
      } else {
        console.log("Hooks already installed");
      }
      break;
    }
    case "uninstall": {
      const removed = await uninstallHooks();
      if (removed.length > 0) {
        console.log(`Removed hooks: ${removed.join(", ")}`);
      } else {
        console.log("No talkback hooks found");
      }
      break;
    }
    default:
      await showHooksStatus();
  }
}

async function handleCache(subcommand?: string): Promise<void> {
  if (subcommand === "clear") {
    const count = await clearCache();
    console.log(`Cleared ${count} cached audio files`);
    return;
  }

  const stats = await getCacheStats();
  console.log("\nAudio Cache Stats\n");
  console.log(`  Cached phrases: ${stats.entries}`);
  console.log(`  Cache size:     ${stats.sizeMB} MB`);
  console.log("\nCommands:");
  console.log("  talkback cache clear    Clear all cached audio\n");
}

async function handleProvider(subcommand?: string, value?: string): Promise<void> {
  const config = await loadConfig();
  const providers = getProviderNames();

  if (subcommand === "list") {
    console.log("\nAvailable TTS Providers:\n");
    for (const p of providers) {
      const active = config.provider === p.name ? " (active)" : "";
      const configured = isProviderConfigured(config, p.name) ? "✓" : " ";
      console.log(`  ${configured} ${p.name.padEnd(12)} ${p.displayName}${active}`);
    }
    console.log("\nCommands:");
    console.log("  talkback provider set <name>   Switch to a provider");
    console.log("  talkback provider add <name>   Configure a provider\n");
    return;
  }

  if (subcommand === "set" && value) {
    const providerName = value as ProviderName;
    if (!providers.find((p) => p.name === providerName)) {
      console.error(`Unknown provider: ${value}`);
      console.error(`Available: ${providers.map((p) => p.name).join(", ")}`);
      process.exit(1);
    }

    if (!isProviderConfigured(config, providerName)) {
      console.error(
        `Provider ${providerName} not configured. Run: talkback provider add ${providerName}`
      );
      process.exit(1);
    }

    const { saveConfig } = await import("./setup.js");
    await saveConfig({ ...config, provider: providerName });
    console.log(`Switched to ${providerName}`);
    return;
  }

  if (subcommand === "add" && value) {
    await configureProvider(value as ProviderName);
    return;
  }

  // Default: show current provider
  const current = config.provider ?? "elevenlabs";
  const providerInfo = providers.find((p) => p.name === current);
  console.log(`\nCurrent provider: ${providerInfo?.displayName ?? current}`);
  console.log("\nRun 'talkback provider list' to see all providers\n");
}

function isProviderConfigured(
  config: Awaited<ReturnType<typeof loadConfig>>,
  name: ProviderName
): boolean {
  // Legacy: check apiKey for elevenlabs
  if (name === "elevenlabs") {
    return !!(
      config.apiKey ||
      config.providers?.elevenlabs?.apiKey ||
      process.env.ELEVENLABS_API_KEY
    );
  }

  // Check environment variables
  const envVars: Record<ProviderName, string[]> = {
    elevenlabs: ["ELEVENLABS_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    azure: ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"],
    aws: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
    google: ["GOOGLE_API_KEY"],
  };

  const vars = envVars[name];
  if (vars.every((v) => process.env[v])) {
    return true;
  }

  // Check config
  return !!config.providers?.[name];
}

async function configureProvider(name: ProviderName): Promise<void> {
  const { createInterface } = await import("node:readline");
  const { saveConfig } = await import("./setup.js");

  const prompt = (question: string): Promise<string> => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  };

  const config = await loadConfig();
  config.providers = config.providers ?? {};

  console.log(`\nConfiguring ${name}...\n`);

  switch (name) {
    case "elevenlabs": {
      console.log("Get your API key at: https://elevenlabs.io/app/settings/api-keys\n");
      const apiKey = await prompt("API Key: ");
      if (!apiKey) {
        console.log("Cancelled");
        return;
      }
      config.providers.elevenlabs = { apiKey };
      config.apiKey = apiKey; // Also set legacy key
      break;
    }
    case "openai": {
      console.log("Get your API key at: https://platform.openai.com/api-keys\n");
      const apiKey = await prompt("API Key: ");
      if (!apiKey) {
        console.log("Cancelled");
        return;
      }
      config.providers.openai = { apiKey };
      break;
    }
    case "azure": {
      console.log("Get credentials from Azure Portal > Speech Services\n");
      const apiKey = await prompt("Speech Key: ");
      const region = await prompt("Region (e.g., eastus): ");
      if (!apiKey || !region) {
        console.log("Cancelled");
        return;
      }
      config.providers.azure = { apiKey, region };
      break;
    }
    case "aws": {
      console.log("Create IAM credentials with Polly access\n");
      const accessKeyId = await prompt("Access Key ID: ");
      const secretAccessKey = await prompt("Secret Access Key: ");
      const region = await prompt("Region (e.g., us-east-1): ");
      if (!accessKeyId || !secretAccessKey || !region) {
        console.log("Cancelled");
        return;
      }
      config.providers.aws = { accessKeyId, secretAccessKey, region };
      break;
    }
    case "google": {
      console.log("Get your API key from Google Cloud Console > APIs & Services\n");
      const apiKey = await prompt("API Key: ");
      if (!apiKey) {
        console.log("Cancelled");
        return;
      }
      config.providers.google = { apiKey };
      break;
    }
  }

  await saveConfig(config);
  console.log(`\n✓ ${name} configured`);

  // Optionally set as active
  const setActive = await prompt(`\nSet ${name} as active provider? [Y/n] `);
  if (setActive.toLowerCase() !== "n") {
    config.provider = name;
    await saveConfig(config);
    console.log(`✓ ${name} is now active`);
  }
}

// --- Main speak functionality ---

async function speak(text: string, options: SpeakOptions): Promise<void> {
  // Check quiet hours (skip for critical priority)
  if (options.priority !== "critical" && (await isQuietTime())) {
    return; // Silent during quiet hours
  }

  const maxLength = parseInt(String(options.maxLength), 10) || 500;

  let processedText = text;

  // AI summarization (if enabled and text is long)
  if (options.summarize && text.length > 200) {
    const result = await summarizeText(text, { maxChars: 150 });
    if (result.savings > 0) {
      processedText = result.summary;
    }
  }

  // Truncate if needed
  const truncated =
    processedText.length > maxLength ? processedText.slice(0, maxLength - 3) + "..." : processedText;

  // Process text for natural speech (phonetics, code stripping)
  const processed = processForSpeech(truncated);

  // Detect sentiment for auto-beep
  const sentiment = detectSentiment(text);

  // Play attention beep for errors/successes
  if (sentiment === "error" || sentiment === "success") {
    await playBeep(sentiment);
  }

  // Resolve voice (needed for signature)
  const voiceName = options.voice ?? process.env.TALKBACK_VOICE ?? DEFAULT_VOICE;
  const voice = getVoice(voiceName);

  if (!voice) {
    console.error(`Unknown voice: ${voiceName}`);
    console.error(`Available: ${VOICE_NAMES.join(", ")}`);
    process.exit(1);
  }

  // Play voice signature (short tone to identify the voice)
  // Note: Commander uses --no-signature which sets signature=false
  if (options.signature !== false) {
    await playVoiceSignature(voice.signatureHz);
  }

  // Local TTS mode (explicit --local flag)
  if (options.local) {
    await speakWithLocalTTS(processed, options.speed);
    return;
  }

  // Get API key
  const apiKey = await getApiKey();
  const config = await loadConfig();

  // If no API key, try local TTS
  if (!apiKey) {
    if (await isLocalTTSAvailable()) {
      console.error("No API key. Using local TTS.");
      await speakWithLocalTTS(processed, options.speed);
      return;
    }
    console.error("No API key. Run: talkback setup");
    process.exit(1);
  }

  // Check budget
  const { allowed, remaining } = await checkBudget(processed.length);
  if (!allowed) {
    // Try local fallback if enabled
    if (config.localFallback && (await isLocalTTSAvailable())) {
      console.error(`Budget exceeded. Using local TTS fallback.`);
      await speakWithLocalTTS(processed, options.speed);
      return;
    }
    console.error(`Daily budget exceeded (${remaining} chars remaining)`);
    process.exit(1);
  }

  // Determine which provider to use
  const providerName = config.provider ?? "elevenlabs";

  // For non-ElevenLabs providers, use the provider abstraction directly
  if (providerName !== "elevenlabs") {
    await speakWithProvider(
      providerName,
      config,
      processed,
      options.speed,
      config.localFallback ?? false
    );
    return;
  }

  // Queue and play with ElevenLabs API, falling back to local if enabled
  await addToQueue({
    text: processed,
    voiceId: voice.elevenLabsId,
    voiceName: voiceName,
    speed: options.speed,
    queuedAt: new Date().toISOString(),
    priority: options.priority,
  });

  await processQueue(apiKey, config.localFallback ?? false, processed, options.speed);
}

async function speakWithProvider(
  providerName: ProviderName,
  config: Awaited<ReturnType<typeof loadConfig>>,
  text: string,
  speed: SpeechSpeed,
  localFallback: boolean
): Promise<void> {
  // Build provider config from environment and saved config
  const providerConfig = buildProviderConfig(config);
  const provider = createProvider(providerName, providerConfig);

  if (!provider) {
    if (localFallback && (await isLocalTTSAvailable())) {
      console.error(`Provider ${providerName} not configured. Using local TTS.`);
      await speakWithLocalTTS(text, speed);
      return;
    }
    console.error(
      `Provider ${providerName} not configured. Run: talkback provider add ${providerName}`
    );
    process.exit(1);
  }

  // Check cache first
  const cacheKey: CacheKey = {
    text,
    voiceId: `${providerName}:${provider.getDefaultVoice()}`,
    speed,
  };

  const cached = await getFromCache(cacheKey);
  if (cached) {
    await playAudio(cached);
    return;
  }

  try {
    const audio = await provider.synthesize(text, { speed });
    await saveToCache(cacheKey, audio);
    await playAudio(audio);
    await recordUsage(text.length);
    await speakBudgetWarnings();
  } catch (err) {
    if (localFallback && (await isLocalTTSAvailable())) {
      console.error(`${provider.displayName} error, using local TTS: ${(err as Error).message}`);
      await speakWithLocalTTS(text, speed);
    } else {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}

function buildProviderConfig(config: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    elevenlabs:
      config.providers?.elevenlabs ??
      (config.apiKey ? { apiKey: config.apiKey } : undefined) ??
      (process.env.ELEVENLABS_API_KEY ? { apiKey: process.env.ELEVENLABS_API_KEY } : undefined),
    openai:
      config.providers?.openai ??
      (process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : undefined),
    azure:
      config.providers?.azure ??
      (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION
        ? { apiKey: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION }
        : undefined),
    aws:
      config.providers?.aws ??
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION,
          }
        : undefined),
    google:
      config.providers?.google ??
      (process.env.GOOGLE_API_KEY ? { apiKey: process.env.GOOGLE_API_KEY } : undefined),
  };
}

async function speakWithLocalTTS(text: string, speed: SpeechSpeed): Promise<void> {
  if (!(await isLocalTTSAvailable())) {
    const status = await getLocalTTSStatus();
    console.error(`Local TTS not available: ${status}`);
    process.exit(1);
  }
  await speakLocal(text, { speed });
}

/**
 * Check and speak budget warnings if thresholds were crossed.
 * Uses local TTS to avoid consuming more budget.
 */
async function speakBudgetWarnings(): Promise<void> {
  const crossedThresholds = await checkWarningThresholds();

  if (crossedThresholds.length === 0) {
    return;
  }

  // Use the highest threshold crossed for the warning message
  const highestThreshold = Math.max(...crossedThresholds);
  const usage = await getBudgetUsage();

  if (!usage) return;

  let message: string;
  if (highestThreshold >= 95) {
    message = `Warning: You've used ${highestThreshold} percent of your daily budget. Only ${usage.remaining} characters remaining.`;
  } else if (highestThreshold >= 90) {
    message = `Budget alert: ${highestThreshold} percent of daily limit used.`;
  } else {
    message = `Budget notice: ${highestThreshold} percent of daily limit reached.`;
  }

  // Speak warning using local TTS (free, doesn't consume budget)
  if (await isLocalTTSAvailable()) {
    await speakLocal(message, { speed: "normal" });
  } else {
    // Fall back to console warning if local TTS unavailable
    console.error(message);
  }
}

async function processQueue(
  apiKey: string,
  localFallback: boolean = false,
  fallbackText?: string,
  fallbackSpeed?: SpeechSpeed
): Promise<void> {
  if (!(await acquirePlaybackLock())) {
    return; // Another process is playing; our message is queued
  }

  try {
    let message: Message | null;
    while ((message = await takeFromQueue())) {
      const cacheKey: CacheKey = {
        text: message.text,
        voiceId: message.voiceId,
        speed: message.speed,
      };

      try {
        // Check cache first
        const cached = await getFromCache(cacheKey);
        if (cached) {
          await playAudio(cached);
          // Don't record usage for cached audio (already counted)
          continue;
        }

        // Call API
        const audio = await textToSpeech(apiKey, {
          text: message.text,
          voiceId: message.voiceId,
          speed: message.speed,
        });

        // Save to cache before playing
        await saveToCache(cacheKey, audio);

        await playAudio(audio);
        await recordUsage(message.text.length);
        await speakBudgetWarnings();
      } catch (err) {
        // API failed - try local fallback if enabled
        if (localFallback && fallbackText && (await isLocalTTSAvailable())) {
          console.error(`API error, using local TTS: ${(err as Error).message}`);
          await speakLocal(fallbackText, { speed: fallbackSpeed ?? "normal" });
        } else {
          console.error(`Error: ${(err as Error).message}`);
        }
      }
    }
  } finally {
    await releasePlaybackLock();
  }
}

// --- Entry point ---

// --- CLI Setup ---

const program = new Command();

program
  .name("talkback")
  .description("Voice for agentic coders - text-to-speech CLI")
  .version("1.0.0")
  .argument("[message...]", "Message to speak")
  .option("-v, --voice <name>", `Voice: ${VOICE_NAMES.join(", ")}`)
  .option("--speed <speed>", "Speech speed: fast, normal, slow", "normal")
  .option("-m, --max-length <n>", "Truncate to n characters", "500")
  .option("-b, --beep <type>", "Play sound instead: success, error")
  .option("-l, --local", "Use local TTS (macOS say / Linux espeak)", false)
  .option("--no-signature", "Skip the voice signature tone")
  .option("-s, --summarize", "AI-summarize long messages (saves TTS costs)")
  .option("-p, --priority <level>", "Message priority: critical, high, normal, low", "normal")
  .action(async (message: string[], options: SpeakOptions) => {
    // Always run in background - respawn and exit immediately
    if (!process.env.TALKBACK_SYNC) {
      const args = process.argv.slice(2);
      const child = spawn(process.argv[0], [process.argv[1], ...args], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, TALKBACK_SYNC: "1" },
      });
      child.unref();
      return;
    }

    await loadSavedAccent();
    if (message.length > 0) {
      await speak(message.join(" "), options);
    } else if (options.beep) {
      await playBeep(options.beep);
    } else {
      program.help();
    }
  });

program
  .command("setup")
  .description("Configure API key and voice accent")
  .action(async () => {
    await runSetup();
  });

program
  .command("voices")
  .description("List available voices")
  .action(async () => {
    await loadSavedAccent();
    showVoices();
  });

program
  .command("stats")
  .description("Show usage and cost statistics")
  .option("--budget <n>", "Set daily character limit (use 'none' to remove)")
  .action(async (options: StatsOptions) => {
    await handleStats(options);
  });

program
  .command("cache")
  .description("Manage audio cache")
  .argument("[action]", "Action: clear")
  .action(async (action?: string) => {
    await handleCache(action);
  });

program
  .command("provider")
  .description("Manage TTS providers")
  .argument("[action]", "Action: list, set, add")
  .argument("[name]", "Provider name")
  .action(async (action?: string, name?: string) => {
    await handleProvider(action, name);
  });

program
  .command("reserve")
  .description("Reserve a voice for this session")
  .action(async () => {
    await loadSavedAccent();
    await handleReserve();
  });

program
  .command("release")
  .description("Release your reserved voice")
  .argument("[voice]", "Voice name to release")
  .action(async (voice?: string) => {
    await handleRelease(voice);
  });

program
  .command("status")
  .description("Show which voices are in use")
  .action(async () => {
    await loadSavedAccent();
    await showStatus();
  });

program
  .command("git")
  .description("Manage git hooks")
  .argument("[action]", "Action: install, uninstall")
  .action(async (action?: string) => {
    await handleGit(action);
  });

program
  .command("quiet")
  .description("Set quiet hours (silence during specified times)")
  .argument("[times]", "Time ranges: 9am-10am,2pm-3pm or 'off' to disable")
  .action(async (times?: string) => {
    if (!times) {
      // Show current status
      console.log(await formatQuietStatus());
      return;
    }

    if (times === "off" || times === "disable") {
      await disableQuietHours();
      console.log("Quiet hours disabled");
      return;
    }

    const ranges = parseQuietHours(times);
    if (ranges.length === 0) {
      console.error("Invalid time format. Examples: 9am-10am, 14:00-15:00, 9-10");
      process.exit(1);
    }

    await setQuietHours(ranges);
    console.log(await formatQuietStatus());
  });

program
  .command("theme")
  .description("Set sound theme for beeps and notifications")
  .argument("[name]", `Theme: ${getThemeNames().join(", ")}`)
  .action(async (name?: string) => {
    if (!name) {
      // Show current theme and list all
      const current = await getCurrentTheme();
      console.log(`\nCurrent theme: ${current.displayName}\n`);
      console.log("Available themes:\n");
      for (const theme of getAllThemes()) {
        const marker = theme.name === current.name ? " ← current" : "";
        console.log(`  ${theme.name.padEnd(10)} ${theme.description}${marker}`);
      }
      console.log(`\nSet theme: talkback theme <name>\n`);
      return;
    }

    if (!isValidTheme(name)) {
      console.error(`Unknown theme: ${name}`);
      console.error(`Available: ${getThemeNames().join(", ")}`);
      process.exit(1);
    }

    await setTheme(name);
    const theme = await getCurrentTheme();
    console.log(`Theme set to: ${theme.displayName}`);

    // Play a demo beep
    await playBeep("success");
  });

program.parseAsync().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
