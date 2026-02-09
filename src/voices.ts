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
  signatureHz: number; // Unique tone frequency for this voice
}

// Signature frequencies (musical notes for pleasant, distinct tones)
// Alex: C5 (523Hz), Sam: E5 (659Hz), Jordan: G5 (784Hz), Casey: D5 (587Hz), Morgan: A4 (440Hz)
const US_VOICES: Record<string, Voice> = {
  alex: { name: "Alex", elevenLabsId: "pNInz6obpgDQGcFmaJgB", description: "Clear, neutral male", signatureHz: 523 },
  sam: { name: "Sam", elevenLabsId: "21m00Tcm4TlvDq8ikWAM", description: "Warm female", signatureHz: 659 },
  jordan: { name: "Jordan", elevenLabsId: "ErXwobaYiN019PkySvjV", description: "Energetic male", signatureHz: 784 },
  casey: { name: "Casey", elevenLabsId: "MF3mGyEYCl7XYWbV9V6O", description: "Calm female", signatureHz: 587 },
  morgan: { name: "Morgan", elevenLabsId: "VR6AewLTigWG4xSOukaG", description: "Deep male", signatureHz: 440 },
};

const BRITISH_VOICES: Record<string, Voice> = {
  alex: { name: "Alex", elevenLabsId: "onwK4e9ZLuTAKqWW03F9", description: "Clear male", signatureHz: 523 },
  sam: { name: "Sam", elevenLabsId: "XB0fDUnXU5powFXDhCwa", description: "Warm female", signatureHz: 659 },
  jordan: { name: "Jordan", elevenLabsId: "JBFqnCBsd6RMkjVDRZzb", description: "Refined male", signatureHz: 784 },
  casey: { name: "Casey", elevenLabsId: "pFZP5JQG7iQjIQuC4Bku", description: "Calm female", signatureHz: 587 },
  morgan: { name: "Morgan", elevenLabsId: "IKne3meq5aSn9XLyUdCD", description: "Deep male", signatureHz: 440 },
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
