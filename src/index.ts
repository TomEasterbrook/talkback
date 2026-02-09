#!/usr/bin/env node

/**
 * Talkback - Voice for agentic coders
 *
 * A CLI tool that speaks text using ElevenLabs text-to-speech.
 * Designed for AI coding assistants running in terminals.
 *
 * Usage:
 *   talkback Hello world           Speak a message
 *   talkback --beep success        Play a quick sound
 *   talkback setup                 Configure API key
 *   talkback voices                List available voices
 *   talkback stats                 View usage statistics
 */

import { textToSpeech, type SpeechSpeed } from "./api.js";
import { playAudio, playBeep } from "./player.js";
import { processForSpeech, detectSentiment } from "./text.js";
import { getVoice, getVoiceDisplayName, getAllVoices, getAccent, DEFAULT_VOICE, VOICE_NAMES } from "./voices.js";
import { reserveVoice, releaseVoice, getVoiceStatuses } from "./locks.js";
import { addToQueue, takeFromQueue, acquirePlaybackLock, releasePlaybackLock, type Message } from "./queue.js";
import { runSetup, getApiKey, loadSavedAccent, loadConfig } from "./setup.js";
import { recordUsage, checkBudget, setBudget, formatStats } from "./stats.js";
import { installHooks, uninstallHooks, showHooksStatus } from "./git.js";
import { speakLocal, isLocalTTSAvailable, getLocalTTSStatus } from "./local-tts.js";
import { getFromCache, saveToCache, clearCache, getCacheStats, type CacheKey } from "./cache.js";
import { createProvider, getProviderNames, type TTSProvider, type ProviderName } from "./providers.js";

// --- CLI Argument Parsing ---

interface Args {
  command: string | null;
  positional: string[];
  voice: string | null;
  speed: SpeechSpeed;
  maxLength: number;
  beep: "success" | "error" | null;
  noPrefix: boolean;
  budget: number | "none" | null;
  local: boolean; // Force local TTS
  help: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    command: null,
    positional: [],
    voice: null,
    speed: "normal",
    maxLength: 500,
    beep: null,
    noPrefix: false,
    budget: null,
    local: false,
    help: false,
  };

  const argv = process.argv.slice(2);
  const commands = ["setup", "voices", "stats", "reserve", "release", "status", "git", "cache", "provider", "help"];

  let i = 0;

  // Check for command
  if (argv[0] && !argv[0].startsWith("-") && commands.includes(argv[0])) {
    args.command = argv[0];
    i = 1;
  }

  // Parse remaining arguments
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "-v" || arg === "--voice") {
      args.voice = argv[++i];
    } else if (arg === "--speed") {
      const speed = argv[++i] as SpeechSpeed;
      if (["fast", "normal", "slow"].includes(speed)) args.speed = speed;
    } else if (arg === "-m" || arg === "--max-length") {
      const len = parseInt(argv[++i], 10);
      if (len > 0) args.maxLength = len;
    } else if (arg === "-b" || arg === "--beep") {
      const type = argv[++i];
      if (type === "success" || type === "error") args.beep = type;
    } else if (arg === "--no-prefix") {
      args.noPrefix = true;
    } else if (arg === "--local" || arg === "-l") {
      args.local = true;
    } else if (arg === "--budget") {
      const val = argv[++i];
      if (val === "none" || val === "off") {
        args.budget = "none";
      } else {
        const num = parseInt(val, 10);
        if (num > 0) args.budget = num;
      }
    } else if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (!arg.startsWith("-")) {
      args.positional.push(arg);
    }

    i++;
  }

  return args;
}

// --- Commands ---

function showHelp(): void {
  console.log(`
Talkback - Voice for agentic coders

Usage:
  talkback <message>              Speak the message
  talkback [command]              Run a command

Commands:
  setup                 Configure API key and voice accent
  voices                List available voices
  stats                 Show usage and cost statistics
  cache                 Show cache stats (cache clear to clear)
  provider              Manage TTS providers (list/set/add)
  reserve               Reserve a voice for this session
  release               Release your reserved voice
  status                Show which voices are in use
  git                   Manage git hooks (install/uninstall)

Options:
  -v, --voice <name>    Voice: ${VOICE_NAMES.join(", ")}
  --speed <speed>       Speech speed: fast, normal, slow
  -m, --max-length <n>  Truncate to n characters (default: 500)
  -b, --beep <type>     Play sound instead: success, error
  -l, --local           Use local TTS (macOS say / Linux espeak)
  --no-prefix           Don't prefix with "Alex says:"
  -h, --help            Show this help

Stats options:
  --budget <n>          Set daily character limit
  --budget none         Remove daily limit

Examples:
  talkback Build complete
  talkback -v sam "Tests passed"
  talkback --beep success
  talkback stats --budget 10000
`);
}

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
    const status = s.available
      ? "✓ available"
      : `🔒 reserved (PID ${s.pid})`;
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

async function handleStats(args: Args): Promise<void> {
  if (args.budget !== null) {
    await setBudget(args.budget === "none" ? null : args.budget);
    console.log(args.budget === "none"
      ? "Budget removed"
      : `Daily budget set to ${args.budget.toLocaleString()} characters`);
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
      console.error(`Provider ${providerName} not configured. Run: talkback provider add ${providerName}`);
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

function isProviderConfigured(config: Awaited<ReturnType<typeof loadConfig>>, name: ProviderName): boolean {
  // Legacy: check apiKey for elevenlabs
  if (name === "elevenlabs") {
    return !!(config.apiKey || config.providers?.elevenlabs?.apiKey || process.env.ELEVENLABS_API_KEY);
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

async function speak(args: Args): Promise<void> {
  // Beep mode - no API needed
  if (args.beep) {
    await playBeep(args.beep);
    return;
  }

  // Get text from arguments
  const text = args.positional.join(" ").trim();
  if (!text) {
    showHelp();
    return;
  }

  // Truncate if needed
  const truncated = text.length > args.maxLength
    ? text.slice(0, args.maxLength - 3) + "..."
    : text;

  // Process text for natural speech (phonetics, code stripping)
  const processed = processForSpeech(truncated);

  // Detect sentiment for auto-beep
  const sentiment = detectSentiment(text);

  // Play attention beep for errors/successes
  if (sentiment === "error" || sentiment === "success") {
    await playBeep(sentiment);
  }

  // Local TTS mode (explicit --local flag)
  if (args.local) {
    await speakWithLocalTTS(processed, args.speed);
    return;
  }

  // Get API key
  const apiKey = await getApiKey();
  const config = await loadConfig();

  // If no API key, try local TTS
  if (!apiKey) {
    if (await isLocalTTSAvailable()) {
      console.error("No API key. Using local TTS.");
      await speakWithLocalTTS(processed, args.speed);
      return;
    }
    console.error("No API key. Run: talkback setup");
    process.exit(1);
  }

  // Resolve voice
  const voiceName = args.voice ?? process.env.TALKBACK_VOICE ?? DEFAULT_VOICE;
  const voice = getVoice(voiceName);

  if (!voice) {
    console.error(`Unknown voice: ${voiceName}`);
    console.error(`Available: ${VOICE_NAMES.join(", ")}`);
    process.exit(1);
  }

  // Build final text with optional prefix
  const finalText = args.noPrefix
    ? processed
    : `${voice.name} says: ${processed}`;

  // Check budget
  const { allowed, remaining } = await checkBudget(finalText.length);
  if (!allowed) {
    // Try local fallback if enabled
    if (config.localFallback && (await isLocalTTSAvailable())) {
      console.error(`Budget exceeded. Using local TTS fallback.`);
      await speakWithLocalTTS(processed, args.speed);
      return;
    }
    console.error(`Daily budget exceeded (${remaining} chars remaining)`);
    process.exit(1);
  }

  // Determine which provider to use
  const providerName = config.provider ?? "elevenlabs";

  // For non-ElevenLabs providers, use the provider abstraction directly
  if (providerName !== "elevenlabs") {
    await speakWithProvider(providerName, config, processed, args.speed, config.localFallback ?? false);
    return;
  }

  // Queue and play with ElevenLabs API, falling back to local if enabled
  await addToQueue({
    text: finalText,
    voiceId: voice.elevenLabsId,
    voiceName: voiceName,
    speed: args.speed,
    queuedAt: new Date().toISOString(),
  });

  await processQueue(apiKey, config.localFallback ?? false, processed, args.speed);
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
    console.error(`Provider ${providerName} not configured. Run: talkback provider add ${providerName}`);
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
    elevenlabs: config.providers?.elevenlabs ?? (config.apiKey ? { apiKey: config.apiKey } : undefined) ??
      (process.env.ELEVENLABS_API_KEY ? { apiKey: process.env.ELEVENLABS_API_KEY } : undefined),
    openai: config.providers?.openai ??
      (process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : undefined),
    azure: config.providers?.azure ??
      (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION
        ? { apiKey: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION }
        : undefined),
    aws: config.providers?.aws ??
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION,
          }
        : undefined),
    google: config.providers?.google ??
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

async function main(): Promise<void> {
  await loadSavedAccent();
  const args = parseArgs();

  if (args.help || args.command === "help") {
    showHelp();
    return;
  }

  switch (args.command) {
    case "setup":
      await runSetup();
      break;
    case "voices":
      showVoices();
      break;
    case "stats":
      await handleStats(args);
      break;
    case "reserve":
      await handleReserve();
      break;
    case "release":
      await handleRelease(args.positional[0]);
      break;
    case "status":
      await showStatus();
      break;
    case "git":
      await handleGit(args.positional[0]);
      break;
    case "cache":
      await handleCache(args.positional[0]);
      break;
    case "provider":
      await handleProvider(args.positional[0], args.positional[1]);
      break;
    default:
      await speak(args);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
