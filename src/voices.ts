/**
 * Voice configuration for Talkback.
 *
 * We use friendly human names (alex, sam, jordan, casey, morgan) that map
 * to ElevenLabs voice IDs. Users can choose US or British accents.
 */

export type Accent = "us" | "british";

export interface Voice {
  name: string;
  elevenLabsId: string;
  description: string;
}

const US_VOICES: Record<string, Voice> = {
  alex: { name: "Alex", elevenLabsId: "pNInz6obpgDQGcFmaJgB", description: "Clear, neutral male" },
  sam: { name: "Sam", elevenLabsId: "21m00Tcm4TlvDq8ikWAM", description: "Warm female" },
  jordan: { name: "Jordan", elevenLabsId: "ErXwobaYiN019PkySvjV", description: "Energetic male" },
  casey: { name: "Casey", elevenLabsId: "MF3mGyEYCl7XYWbV9V6O", description: "Calm female" },
  morgan: { name: "Morgan", elevenLabsId: "VR6AewLTigWG4xSOukaG", description: "Deep male" },
};

const BRITISH_VOICES: Record<string, Voice> = {
  alex: { name: "Alex", elevenLabsId: "onwK4e9ZLuTAKqWW03F9", description: "Clear male" },
  sam: { name: "Sam", elevenLabsId: "XB0fDUnXU5powFXDhCwa", description: "Warm female" },
  jordan: { name: "Jordan", elevenLabsId: "JBFqnCBsd6RMkjVDRZzb", description: "Refined male" },
  casey: { name: "Casey", elevenLabsId: "pFZP5JQG7iQjIQuC4Bku", description: "Calm female" },
  morgan: { name: "Morgan", elevenLabsId: "IKne3meq5aSn9XLyUdCD", description: "Deep male" },
};

const VOICE_SETS = { us: US_VOICES, british: BRITISH_VOICES };

// --- State ---

let currentAccent: Accent = "us";

// --- Public API ---

export const VOICE_NAMES = Object.keys(US_VOICES);
export const DEFAULT_VOICE = "alex";

export function setAccent(accent: Accent): void {
  currentAccent = accent;
}

export function getAccent(): Accent {
  return currentAccent;
}

export function getAllVoices(): Record<string, Voice> {
  return VOICE_SETS[currentAccent];
}

export function getVoice(name: string): Voice | undefined {
  return VOICE_SETS[currentAccent][name.toLowerCase()];
}

export function getVoiceDisplayName(name: string): string {
  return getVoice(name)?.name ?? name;
}
