/**
 * TTS Provider abstraction for multiple speech synthesis services.
 *
 * Supported providers:
 * - elevenlabs: ElevenLabs (default, high quality)
 * - openai: OpenAI TTS (good quality, simple pricing)
 * - azure: Azure Cognitive Services (enterprise)
 * - aws: AWS Polly (cost-effective)
 * - google: Google Cloud TTS (multilingual)
 */

import {
  API_TIMEOUT_MS,
  SPEED_MULTIPLIERS,
  getWhisperSettings,
  type SpeechSpeed,
} from "./constants.js";

export type ProviderName = "elevenlabs" | "openai" | "azure" | "aws" | "google";

export interface TTSRequest {
  text: string;
  voice?: string; // Provider-specific voice ID
  speed?: SpeechSpeed;
  whisper?: boolean; // Soft, breathy voice style
}

export interface TTSResult {
  audio: Buffer;
  nativeWhisper: boolean; // True if provider applied native whisper effect
}

export interface TTSProvider {
  name: ProviderName;
  displayName: string;
  synthesize(text: string, options?: { voice?: string; speed?: SpeechSpeed; whisper?: boolean }): Promise<TTSResult>;
  validateCredentials(): Promise<boolean>;
  getDefaultVoice(): string;
  listVoices(): { id: string; name: string; description: string }[];
}

export interface ProviderConfig {
  elevenlabs?: { apiKey: string };
  openai?: { apiKey: string };
  azure?: { apiKey: string; region: string };
  aws?: { accessKeyId: string; secretAccessKey: string; region: string };
  google?: { apiKey: string };
}

// --- ElevenLabs Provider ---

export function createElevenLabsProvider(apiKey: string): TTSProvider {
  const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
  const MODEL = "eleven_turbo_v2_5";

  const voices = [
    { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Calm female" },
    { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", description: "Strong female" },
    { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Soft female" },
    { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Well-rounded male" },
    { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", description: "Crisp male" },
  ];

  return {
    name: "elevenlabs",
    displayName: "ElevenLabs",

    async synthesize(text, options = {}) {
      const voice = options.voice ?? voices[0].id;
      const speed = options.speed ?? "normal";
      const whisper = options.whisper ?? false;
      const url = `${ELEVENLABS_API}/text-to-speech/${voice}?output_format=mp3_44100_128`;

      const { stability, similarityBoost } = getWhisperSettings(whisper);

      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: MODEL,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            speed: SPEED_MULTIPLIERS[speed],
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await extractError(response, "ElevenLabs"));
      }

      return {
        audio: Buffer.from(await response.arrayBuffer()),
        nativeWhisper: whisper, // ElevenLabs applies partial whisper via voice settings
      };
    },

    async validateCredentials() {
      try {
        const response = await fetchWithTimeout(`${ELEVENLABS_API}/user`, {
          headers: { "xi-api-key": apiKey },
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    getDefaultVoice() {
      return voices[0].id;
    },

    listVoices() {
      return voices;
    },
  };
}

// --- OpenAI Provider ---

export function createOpenAIProvider(apiKey: string): TTSProvider {
  const OPENAI_API = "https://api.openai.com/v1";

  const voices = [
    { id: "alloy", name: "Alloy", description: "Neutral and balanced" },
    { id: "echo", name: "Echo", description: "Warm and clear" },
    { id: "fable", name: "Fable", description: "Expressive British" },
    { id: "onyx", name: "Onyx", description: "Deep and authoritative" },
    { id: "nova", name: "Nova", description: "Friendly and upbeat" },
    { id: "shimmer", name: "Shimmer", description: "Soft and gentle" },
  ];

  return {
    name: "openai",
    displayName: "OpenAI",

    async synthesize(text, options = {}) {
      const voice = options.voice ?? "alloy";
      const speed = SPEED_MULTIPLIERS[options.speed ?? "normal"];
      const whisper = options.whisper ?? false;

      const response = await fetchWithTimeout(`${OPENAI_API}/audio/speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "tts-1",
          input: text,
          voice,
          speed,
          response_format: "mp3",
        }),
      });

      if (!response.ok) {
        throw new Error(await extractError(response, "OpenAI"));
      }

      return {
        audio: Buffer.from(await response.arrayBuffer()),
        nativeWhisper: false, // OpenAI doesn't support native whisper; use volume fallback
      };
    },

    async validateCredentials() {
      try {
        const response = await fetchWithTimeout(`${OPENAI_API}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    getDefaultVoice() {
      return "alloy";
    },

    listVoices() {
      return voices;
    },
  };
}

// --- Azure Provider ---

export function createAzureProvider(apiKey: string, region: string): TTSProvider {
  const voices = [
    { id: "en-US-JennyNeural", name: "Jenny", description: "US female" },
    { id: "en-US-GuyNeural", name: "Guy", description: "US male" },
    { id: "en-GB-SoniaNeural", name: "Sonia", description: "UK female" },
    { id: "en-GB-RyanNeural", name: "Ryan", description: "UK male" },
    { id: "en-AU-NatashaNeural", name: "Natasha", description: "AU female" },
  ];

  return {
    name: "azure",
    displayName: "Azure",

    async synthesize(text, options = {}) {
      const voice = options.voice ?? voices[0].id;
      const rate = options.speed === "fast" ? "+20%" : options.speed === "slow" ? "-20%" : "+0%";
      const whisper = options.whisper ?? false;

      // Build the inner content with optional whisper style
      const escapedText = escapeXml(text);
      const innerContent = whisper
        ? `<mstts:express-as style="whispering">${escapedText}</mstts:express-as>`
        : escapedText;

      const ssml = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
          <voice name="${voice}">
            <prosody rate="${rate}">${innerContent}</prosody>
          </voice>
        </speak>
      `.trim();

      const response = await fetchWithTimeout(
        `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
            "Ocp-Apim-Subscription-Key": apiKey,
          },
          body: ssml,
        }
      );

      if (!response.ok) {
        throw new Error(await extractError(response, "Azure"));
      }

      return {
        audio: Buffer.from(await response.arrayBuffer()),
        nativeWhisper: whisper, // Azure supports native whisper via SSML
      };
    },

    async validateCredentials() {
      try {
        const response = await fetchWithTimeout(
          `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
          {
            method: "POST",
            headers: { "Ocp-Apim-Subscription-Key": apiKey },
          }
        );
        return response.ok;
      } catch {
        return false;
      }
    },

    getDefaultVoice() {
      return voices[0].id;
    },

    listVoices() {
      return voices;
    },
  };
}

// --- AWS Polly Provider ---

export function createAWSProvider(
  accessKeyId: string,
  secretAccessKey: string,
  region: string
): TTSProvider {
  const voices = [
    { id: "Joanna", name: "Joanna", description: "US female (neural)" },
    { id: "Matthew", name: "Matthew", description: "US male (neural)" },
    { id: "Amy", name: "Amy", description: "UK female (neural)" },
    { id: "Brian", name: "Brian", description: "UK male (neural)" },
    { id: "Olivia", name: "Olivia", description: "AU female (neural)" },
  ];

  // AWS Signature V4 signing is complex - we'll use a simplified approach
  // In production, you'd use @aws-sdk/client-polly
  return {
    name: "aws",
    displayName: "AWS Polly",

    async synthesize(text, options = {}) {
      const voice = options.voice ?? "Joanna";
      const whisper = options.whisper ?? false;

      // Build the request - use SSML for whisper effect
      const endpoint = `https://polly.${region}.amazonaws.com/v1/speech`;
      const speechText = whisper
        ? `<speak><amazon:effect name="whispered">${escapeXml(text)}</amazon:effect></speak>`
        : text;

      const body = JSON.stringify({
        OutputFormat: "mp3",
        Text: speechText,
        TextType: whisper ? "ssml" : "text",
        VoiceId: voice,
        Engine: "neural",
      });

      // Create AWS Signature V4 headers
      const headers = await signAWSRequest(
        "POST",
        endpoint,
        body,
        accessKeyId,
        secretAccessKey,
        region,
        "polly"
      );

      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body,
      });

      if (!response.ok) {
        throw new Error(await extractError(response, "AWS Polly"));
      }

      return {
        audio: Buffer.from(await response.arrayBuffer()),
        nativeWhisper: whisper, // AWS Polly supports native whisper via SSML
      };
    },

    async validateCredentials() {
      // AWS validation is more complex, simplified for now
      return !!(accessKeyId && secretAccessKey && region);
    },

    getDefaultVoice() {
      return "Joanna";
    },

    listVoices() {
      return voices;
    },
  };
}

// --- Google Cloud Provider ---

export function createGoogleProvider(apiKey: string): TTSProvider {
  const GOOGLE_API = "https://texttospeech.googleapis.com/v1";

  const voices = [
    { id: "en-US-Neural2-C", name: "US Female", description: "Neural US female" },
    { id: "en-US-Neural2-D", name: "US Male", description: "Neural US male" },
    { id: "en-GB-Neural2-A", name: "UK Female", description: "Neural UK female" },
    { id: "en-GB-Neural2-B", name: "UK Male", description: "Neural UK male" },
    { id: "en-AU-Neural2-A", name: "AU Female", description: "Neural AU female" },
  ];

  return {
    name: "google",
    displayName: "Google Cloud",

    async synthesize(text, options = {}) {
      const voice = options.voice ?? voices[0].id;
      const speakingRate = SPEED_MULTIPLIERS[options.speed ?? "normal"];

      const response = await fetchWithTimeout(`${GOOGLE_API}/text:synthesize?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: voice.split("-").slice(0, 2).join("-"),
            name: voice,
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await extractError(response, "Google Cloud"));
      }

      const data = await response.json();
      return {
        audio: Buffer.from(data.audioContent, "base64"),
        nativeWhisper: false, // Google doesn't support native whisper; use volume fallback
      };
    },

    async validateCredentials() {
      try {
        const response = await fetchWithTimeout(`${GOOGLE_API}/voices?key=${apiKey}`, {
          method: "GET",
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    getDefaultVoice() {
      return voices[0].id;
    },

    listVoices() {
      return voices;
    },
  };
}

// --- Provider Factory ---

export function createProvider(name: ProviderName, config: ProviderConfig): TTSProvider | null {
  switch (name) {
    case "elevenlabs":
      if (config.elevenlabs?.apiKey) {
        return createElevenLabsProvider(config.elevenlabs.apiKey);
      }
      break;
    case "openai":
      if (config.openai?.apiKey) {
        return createOpenAIProvider(config.openai.apiKey);
      }
      break;
    case "azure":
      if (config.azure?.apiKey && config.azure?.region) {
        return createAzureProvider(config.azure.apiKey, config.azure.region);
      }
      break;
    case "aws":
      if (config.aws?.accessKeyId && config.aws?.secretAccessKey && config.aws?.region) {
        return createAWSProvider(
          config.aws.accessKeyId,
          config.aws.secretAccessKey,
          config.aws.region
        );
      }
      break;
    case "google":
      if (config.google?.apiKey) {
        return createGoogleProvider(config.google.apiKey);
      }
      break;
  }
  return null;
}

export function getProviderNames(): { name: ProviderName; displayName: string }[] {
  return [
    { name: "elevenlabs", displayName: "ElevenLabs (high quality)" },
    { name: "openai", displayName: "OpenAI (simple pricing)" },
    { name: "azure", displayName: "Azure (enterprise)" },
    { name: "aws", displayName: "AWS Polly (cost-effective)" },
    { name: "google", displayName: "Google Cloud (multilingual)" },
  ];
}

// --- Helpers ---

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${API_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function extractError(response: Response, provider: string): Promise<string> {
  const fallback = `${provider} API error (${response.status})`;
  try {
    const data = await response.json();
    return data.error?.message ?? data.message ?? data.detail ?? fallback;
  } catch {
    return fallback;
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Simplified AWS Signature V4 (for demo - production should use AWS SDK)
async function signAWSRequest(
  method: string,
  url: string,
  body: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  service: string
): Promise<Record<string, string>> {
  const { createHmac, createHash } = await import("node:crypto");

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const urlObj = new URL(url);
  const host = urlObj.host;

  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-date";

  const payloadHash = createHash("sha256").update(body).digest("hex");

  const canonicalRequest = [
    method,
    urlObj.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const getSignatureKey = (key: string, date: string, reg: string, svc: string) => {
    const kDate = createHmac("sha256", `AWS4${key}`).update(date).digest();
    const kRegion = createHmac("sha256", kDate).update(reg).digest();
    const kService = createHmac("sha256", kRegion).update(svc).digest();
    return createHmac("sha256", kService).update("aws4_request").digest();
  };

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorizationHeader,
    "X-Amz-Date": amzDate,
  };
}
