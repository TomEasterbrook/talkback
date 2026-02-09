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
import { runSetup, getApiKey, loadSavedAccent } from "./setup.js";
import { recordUsage, checkBudget, setBudget, formatStats } from "./stats.js";
import { installHooks, uninstallHooks, showHooksStatus } from "./git.js";

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
    help: false,
  };

  const argv = process.argv.slice(2);
  const commands = ["setup", "voices", "stats", "reserve", "release", "status", "git", "help"];

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
  reserve               Reserve a voice for this session
  release               Release your reserved voice
  status                Show which voices are in use
  git                   Manage git hooks (install/uninstall)

Options:
  -v, --voice <name>    Voice: ${VOICE_NAMES.join(", ")}
  --speed <speed>       Speech speed: fast, normal, slow
  -m, --max-length <n>  Truncate to n characters (default: 500)
  -b, --beep <type>     Play sound instead: success, error
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

// --- Main speak functionality ---

async function speak(args: Args): Promise<void> {
  // Beep mode - no API needed
  if (args.beep) {
    await playBeep(args.beep);
    return;
  }

  // Get API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.error("No API key. Run: talkback setup");
    process.exit(1);
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

  // Resolve voice
  const voiceName = args.voice ?? process.env.TALKBACK_VOICE ?? DEFAULT_VOICE;
  const voice = getVoice(voiceName);

  if (!voice) {
    console.error(`Unknown voice: ${voiceName}`);
    console.error(`Available: ${VOICE_NAMES.join(", ")}`);
    process.exit(1);
  }

  // Process text for natural speech (phonetics, code stripping)
  const processed = processForSpeech(truncated);

  // Detect sentiment for auto-beep
  const sentiment = detectSentiment(text);

  // Build final text with optional prefix
  const finalText = args.noPrefix
    ? processed
    : `${voice.name} says: ${processed}`;

  // Check budget
  const { allowed, remaining } = await checkBudget(finalText.length);
  if (!allowed) {
    console.error(`Daily budget exceeded (${remaining} chars remaining)`);
    process.exit(1);
  }

  // Play attention beep for errors/successes
  if (sentiment === "error" || sentiment === "success") {
    await playBeep(sentiment);
  }

  // Queue and play
  await addToQueue({
    text: finalText,
    voiceId: voice.elevenLabsId,
    voiceName: voiceName,
    speed: args.speed,
    queuedAt: new Date().toISOString(),
  });

  await processQueue(apiKey);
}

async function processQueue(apiKey: string): Promise<void> {
  if (!(await acquirePlaybackLock())) {
    return; // Another process is playing; our message is queued
  }

  try {
    let message: Message | null;
    while ((message = await takeFromQueue())) {
      try {
        const audio = await textToSpeech(apiKey, {
          text: message.text,
          voiceId: message.voiceId,
          speed: message.speed,
        });
        await playAudio(audio);
        await recordUsage(message.text.length);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
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
    default:
      await speak(args);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
