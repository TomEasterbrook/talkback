/**
 * Core speak functionality and queue processing.
 *
 * Handles text-to-speech synthesis via API or local fallback,
 * with caching, budget management, and queue-based playback.
 */

import { textToSpeech, textToSpeechStream } from "../api.js";
import { playAudio, playAudioStream, playBeep, playVoiceSignature, getWhisperVolume } from "../player.js";
import { processForSpeech, detectSentiment } from "../text.js";
import { getVoice, DEFAULT_VOICE, VOICE_NAMES } from "../voices.js";
import { addToQueue, takeFromQueue, acquirePlaybackLock, releasePlaybackLock, type Message } from "../queue.js";
import { getApiKey, loadConfig } from "../setup.js";
import { recordUsage, checkBudget, checkWarningThresholds, getBudgetUsage } from "../stats.js";
import { speakLocal, isLocalTTSAvailable, getLocalTTSStatus, setPreferredPiperVoice } from "../local-tts.js";
import { getFromCache, saveToCache, type CacheKey } from "../cache.js";
import { createProvider, type ProviderName } from "../providers.js";
import { summarizeText } from "../summarize.js";
import { isQuietTime } from "../quiet.js";
import type { SpeechSpeed } from "../constants.js";
import type { Priority } from "../validation.js";

export interface SpeakOptions {
  voice?: string;
  speed: SpeechSpeed;
  maxLength: number;
  beep?: "success" | "error";
  local: boolean;
  signature?: boolean;
  summarize?: boolean;
  priority?: Priority;
  stream?: boolean;
  whisper?: boolean;
}

/**
 * Main speak function - synthesizes and plays text.
 */
export async function speak(text: string, options: SpeakOptions): Promise<void> {
  // Check quiet hours (skip for critical priority)
  if (options.priority !== "critical" && (await isQuietTime())) {
    return;
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
  if (options.signature !== false) {
    await playVoiceSignature(voice.signatureHz);
  }

  // Local TTS mode (explicit --local flag)
  if (options.local) {
    await speakWithLocalTTS(processed, options.speed);
    return;
  }

  // Get API key and config
  const apiKey = await getApiKey();
  const config = await loadConfig();

  // Load preferred Piper voice for local fallback
  if (config.piperVoice) {
    setPreferredPiperVoice(config.piperVoice);
  }

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
      config.localFallback ?? false,
      options.whisper ?? false
    );
    return;
  }

  // Streaming mode: bypass queue and play directly
  if (options.stream) {
    try {
      const stream = await textToSpeechStream(apiKey, {
        text: processed,
        voiceId: voice.elevenLabsId,
        speed: options.speed,
        whisper: options.whisper,
      });
      const volume = options.whisper ? getWhisperVolume() : undefined;
      await playAudioStream(stream, { volume });
      await recordUsage(processed.length);
      await speakBudgetWarnings();
    } catch (err) {
      if (config.localFallback && (await isLocalTTSAvailable())) {
        console.error(`Streaming error, using local TTS: ${(err as Error).message}`);
        await speakWithLocalTTS(processed, options.speed);
      } else {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    }
    return;
  }

  // Queue and play with ElevenLabs API
  await addToQueue({
    text: processed,
    voiceId: voice.elevenLabsId,
    voiceName: voiceName,
    speed: options.speed,
    queuedAt: new Date().toISOString(),
    priority: options.priority,
    whisper: options.whisper,
  });

  await processQueue(apiKey, config.localFallback ?? false, processed, options.speed, options.whisper);
}

async function speakWithProvider(
  providerName: ProviderName,
  config: Awaited<ReturnType<typeof loadConfig>>,
  text: string,
  speed: SpeechSpeed,
  localFallback: boolean,
  whisper: boolean = false
): Promise<void> {
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

  const cacheKey: CacheKey = {
    text,
    voiceId: `${providerName}:${provider.getDefaultVoice()}${whisper ? ":whisper" : ""}`,
    speed,
  };

  const cached = await getFromCache(cacheKey);
  if (cached) {
    const volume = whisper ? getWhisperVolume() : undefined;
    await playAudio(cached, { volume });
    return;
  }

  try {
    const result = await provider.synthesize(text, { speed, whisper });
    await saveToCache(cacheKey, result.audio);

    const volume = whisper && !result.nativeWhisper ? getWhisperVolume() : undefined;
    await playAudio(result.audio, { volume });
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

export function buildProviderConfig(config: Awaited<ReturnType<typeof loadConfig>>) {
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

export async function speakWithLocalTTS(text: string, speed: SpeechSpeed): Promise<void> {
  if (!(await isLocalTTSAvailable())) {
    const status = await getLocalTTSStatus();
    console.error(`Local TTS not available: ${status}`);
    process.exit(1);
  }
  await speakLocal(text, { speed });
}

async function speakBudgetWarnings(): Promise<void> {
  const crossedThresholds = await checkWarningThresholds();

  if (crossedThresholds.length === 0) {
    return;
  }

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

  if (await isLocalTTSAvailable()) {
    await speakLocal(message, { speed: "normal" });
  } else {
    console.error(message);
  }
}

async function processQueue(
  apiKey: string,
  localFallback: boolean = false,
  fallbackText?: string,
  fallbackSpeed?: SpeechSpeed,
  fallbackWhisper?: boolean
): Promise<void> {
  if (!(await acquirePlaybackLock())) {
    return;
  }

  try {
    let message: Message | null;
    while ((message = await takeFromQueue())) {
      const whisper = message.whisper ?? false;
      const cacheKey: CacheKey = {
        text: message.text,
        voiceId: `${message.voiceId}${whisper ? ":whisper" : ""}`,
        speed: message.speed,
      };

      try {
        const cached = await getFromCache(cacheKey);
        if (cached) {
          const volume = whisper ? getWhisperVolume() : undefined;
          await playAudio(cached, { volume });
          continue;
        }

        const audio = await textToSpeech(apiKey, {
          text: message.text,
          voiceId: message.voiceId,
          speed: message.speed,
          whisper,
        });

        await saveToCache(cacheKey, audio);

        const volume = whisper ? getWhisperVolume() : undefined;
        await playAudio(audio, { volume });
        await recordUsage(message.text.length);
        await speakBudgetWarnings();
      } catch (err) {
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
