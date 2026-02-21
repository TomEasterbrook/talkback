/**
 * Voice management commands.
 *
 * Handles voice listing, status display, and reservation for multi-session support.
 */

import { textToSpeech } from "../api.js";
import { playAudio } from "../player.js";
import { getVoice, getVoiceDisplayName, getAllVoices, getAccent, getDefaultVoice } from "../voices.js";
import { reserveVoice, releaseVoice, getVoiceStatuses } from "../locks.js";
import { getApiKey, loadConfig } from "../setup.js";
import { recordUsage } from "../stats.js";

/**
 * Display all available voices.
 */
export async function showVoices(): Promise<void> {
  const voices = getAllVoices();
  const accent = getAccent();
  const config = await loadConfig();
  const defaultVoice = getDefaultVoice(config.voiceGender, config.defaultVoice);

  console.log(`\nAvailable voices (${accent === "british" ? "British" : "US"}):\n`);
  for (const [key, voice] of Object.entries(voices)) {
    const marker = key === defaultVoice ? " (default)" : "";
    console.log(`  ${voice.name.padEnd(8)} ${voice.description}${marker}`);
  }
  console.log("\nChange voice: talkback voice setup\n");
}

/**
 * Show current voice reservation status.
 */
export async function showStatus(): Promise<void> {
  const statuses = await getVoiceStatuses();

  console.log("\nVoice reservations:\n");
  for (const s of statuses) {
    const name = getVoiceDisplayName(s.voice);
    const status = s.available ? "available" : `reserved (PID ${s.pid})`;
    console.log(`  ${name.padEnd(8)} ${status}`);
  }
  console.log();
}

/**
 * Reserve a voice for this session.
 */
export async function handleReserve(announce: boolean = true): Promise<void> {
  const voiceName = await reserveVoice();
  if (!voiceName) {
    console.error("All voices are currently reserved");
    process.exit(1);
  }

  console.log(voiceName);

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

/**
 * Release a reserved voice.
 */
export async function handleRelease(voiceName?: string): Promise<void> {
  if (await releaseVoice(voiceName)) {
    console.log("Voice released");
  } else {
    console.error("Could not release voice");
    process.exit(1);
  }
}
