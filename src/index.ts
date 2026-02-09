#!/usr/bin/env node

/**
 * Talkback - Voice for agentic coders
 *
 * A CLI tool that speaks text using ElevenLabs text-to-speech.
 * Designed for AI coding assistants running in terminals.
 */

import { Command } from "commander";
import { spawn } from "node:child_process";
import { playBeep } from "./player.js";
import { VOICE_NAMES } from "./voices.js";
import { runSetup, loadSavedAccent } from "./setup.js";
import { getThemeNames } from "./themes.js";
import {
  speak,
  showVoices,
  showStatus,
  handleReserve,
  handleRelease,
  handleStats,
  handleGit,
  handleCache,
  handleProvider,
  handleQuiet,
  handleTheme,
  type SpeakOptions,
  type StatsOptions,
} from "./commands/index.js";

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
  .option("--stream", "Stream audio for lower perceived latency")
  .option("-w, --whisper", "Soft, breathy voice (native on Azure/AWS, volume fallback on others)")
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
    await handleQuiet(times);
  });

program
  .command("theme")
  .description("Set sound theme for beeps and notifications")
  .argument("[name]", `Theme: ${getThemeNames().join(", ")}`)
  .action(async (name?: string) => {
    await handleTheme(name);
  });

program.parseAsync().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
