/**
 * ElevenLabs Text-to-Speech API client.
 *
 * Uses the Turbo v2.5 model for fast, cost-effective speech synthesis.
 * https://elevenlabs.io/docs/api-reference/text-to-speech
 */

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
const MODEL = "eleven_turbo_v2_5";
const OUTPUT_FORMAT = "mp3_44100_128";
const API_TIMEOUT_MS = 30000; // 30 second timeout

export type SpeechSpeed = "fast" | "normal" | "slow";

const SPEED_MULTIPLIERS: Record<SpeechSpeed, number> = {
  fast: 1.2,
  normal: 1.0,
  slow: 0.8,
};

export interface TextToSpeechRequest {
  text: string;
  voiceId: string;
  speed?: SpeechSpeed;
}

export async function textToSpeech(apiKey: string, request: TextToSpeechRequest): Promise<Buffer> {
  const { text, voiceId, speed = "normal" } = request;
  const url = `${ELEVENLABS_API}/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed: SPEED_MULTIPLIERS[speed],
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response));
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`API request timed out after ${API_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function isApiKeyValid(apiKey: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${ELEVENLABS_API}/user`, {
      headers: { "xi-api-key": apiKey },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function extractErrorMessage(response: Response): Promise<string> {
  const fallback = `ElevenLabs API error (${response.status})`;

  try {
    const json = await response.json();
    return json.detail?.message ?? json.detail ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Stream text-to-speech audio in real-time.
 * Returns a ReadableStream that yields audio chunks as they're generated.
 */
export async function textToSpeechStream(
  apiKey: string,
  request: TextToSpeechRequest
): Promise<ReadableStream<Uint8Array>> {
  const { text, voiceId, speed = "normal" } = request;
  const url = `${ELEVENLABS_API}/text-to-speech/${voiceId}/stream?output_format=${OUTPUT_FORMAT}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed: SPEED_MULTIPLIERS[speed],
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response));
    }

    if (!response.body) {
      throw new Error("No response body for streaming");
    }

    // Clear timeout once we start receiving the stream
    clearTimeout(timeoutId);

    return response.body;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`API request timed out after ${API_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }
}
