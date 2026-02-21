/**
 * Interactive voice setup wizard.
 *
 * Allows users to browse voices by accent, try them out,
 * and set a default voice.
 */

import * as p from "@clack/prompts";
import { loadConfig, saveConfig } from "../setup.js";
import { getVoicesForAccent, setAccent, type Accent, type Voice } from "../voices.js";
import { textToSpeech } from "../api.js";
import { playAudio } from "../player.js";
import { getApiKey } from "../setup.js";

async function tryVoice(voice: Voice, apiKey: string | null): Promise<void> {
  const sampleText = `Hi, I'm ${voice.name}. This is what I sound like.`;

  if (!apiKey) {
    p.log.warn("No API key configured. Run 'talkback setup' first.");
    return;
  }

  const spinner = p.spinner();
  spinner.start(`Playing ${voice.name}...`);

  try {
    const audio = await textToSpeech(apiKey, {
      text: sampleText,
      voiceId: voice.elevenLabsId,
    });
    await playAudio(audio);
    spinner.stop(`Played ${voice.name}`);
  } catch (err) {
    spinner.stop("Playback failed");
    p.log.error((err as Error).message);
  }
}

async function browseVoices(accent: Accent): Promise<void> {
  const voices = getVoicesForAccent(accent);
  const voiceList = Object.entries(voices);
  const apiKey = await getApiKey();

  while (true) {
    const choice = await p.select({
      message: `Select a voice to preview (${accent === "us" ? "US" : "British"})`,
      options: [
        ...voiceList.map(([key, voice]) => ({
          value: key,
          label: voice.name,
          hint: voice.description,
        })),
        { value: "_back", label: "← Back to menu" },
      ],
    });

    if (p.isCancel(choice) || choice === "_back") {
      return;
    }

    const voice = voices[choice];
    await tryVoice(voice, apiKey);
  }
}

async function setDefaultVoice(accent: Accent): Promise<string | null> {
  const voices = getVoicesForAccent(accent);
  const voiceList = Object.entries(voices);

  const choice = await p.select({
    message: `Select default voice (${accent === "us" ? "US" : "British"})`,
    options: [
      ...voiceList.map(([key, voice]) => ({
        value: key,
        label: voice.name,
        hint: voice.description,
      })),
      { value: "_clear", label: "Clear selection", hint: "Use gender-based default" },
      { value: "_back", label: "← Back to menu" },
    ],
  });

  if (p.isCancel(choice) || choice === "_back") {
    return null;
  }

  if (choice === "_clear") {
    return "clear";
  }

  return choice;
}

export async function runVoiceSetup(): Promise<void> {
  const config = await loadConfig();
  let currentAccent: Accent = config.accent ?? "us";
  let defaultVoice: string | undefined = config.defaultVoice;

  setAccent(currentAccent);

  p.intro("🎤 Voice Setup");

  while (true) {
    const voices = getVoicesForAccent(currentAccent);
    const defaultVoiceName = defaultVoice
      ? voices[defaultVoice]?.name ?? defaultVoice
      : "Gender-based (Alex/Sam)";

    p.note(
      `Accent:  ${currentAccent === "us" ? "US" : "British"}\n` + `Voice:   ${defaultVoiceName}`,
      "Current settings"
    );

    const action = await p.select({
      message: "What would you like to do?",
      options: [
        { value: "accent", label: "Change accent", hint: "US or British" },
        { value: "browse", label: "Browse & try voices", hint: "Preview available voices" },
        { value: "default", label: "Set default voice", hint: "Choose your preferred voice" },
        { value: "exit", label: "Exit" },
      ],
    });

    if (p.isCancel(action) || action === "exit") {
      p.outro("Goodbye!");
      return;
    }

    switch (action) {
      case "accent": {
        const newAccent = await p.select({
          message: "Select accent",
          initialValue: currentAccent,
          options: [
            { value: "us", label: "US English" },
            { value: "british", label: "British English" },
          ],
        });

        if (!p.isCancel(newAccent) && newAccent !== currentAccent) {
          currentAccent = newAccent as Accent;
          setAccent(currentAccent);
          // Clear default voice when changing accent
          defaultVoice = undefined;
          await saveConfig({ ...config, accent: currentAccent, defaultVoice: undefined });
          p.log.success(`Accent changed to ${currentAccent === "us" ? "US" : "British"}`);
        }
        break;
      }

      case "browse": {
        await browseVoices(currentAccent);
        break;
      }

      case "default": {
        const result = await setDefaultVoice(currentAccent);
        if (result === "clear") {
          defaultVoice = undefined;
          await saveConfig({ ...config, accent: currentAccent, defaultVoice: undefined });
          p.log.success("Default voice cleared (will use gender-based default)");
        } else if (result) {
          defaultVoice = result;
          await saveConfig({ ...config, accent: currentAccent, defaultVoice });
          const voiceName = getVoicesForAccent(currentAccent)[result].name;
          p.log.success(`Default voice set to ${voiceName}`);
        }
        break;
      }
    }
  }
}
