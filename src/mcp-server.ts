#!/usr/bin/env node

/**
 * Talkback MCP Server
 *
 * Exposes talkback functionality via Model Context Protocol.
 * Compatible with Claude Code, Gemini CLI, and other MCP clients.
 *
 * Usage:
 *   Add to Claude Code's MCP config:
 *   {
 *     "mcpServers": {
 *       "talkback": {
 *         "command": "npx",
 *         "args": ["talkback-cli", "mcp"]
 *       }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { textToSpeech, type SpeechSpeed } from "./api.js";
import { playAudio, playBeep, getWhisperVolume } from "./player.js";
import { processForSpeech, detectSentiment } from "./text.js";
import { getVoice, getAllVoices, getDefaultVoice } from "./voices.js";
import { reserveVoice, releaseVoice, getVoiceStatuses } from "./locks.js";
import { getApiKey, loadSavedAccent, loadConfig } from "./setup.js";
import { recordUsage, checkBudget } from "./stats.js";
import { isQuietTime } from "./quiet.js";
import { getFromCache, saveToCache, type CacheKey } from "./cache.js";
import { speakLocal, isLocalTTSAvailable } from "./local-tts.js";

// Initialize accent
await loadSavedAccent();

// Create the MCP server
const server = new McpServer({
  name: "talkback",
  version: "1.0.0",
});

// --- Tool: speak ---
server.tool(
  "speak",
  "Speak a message aloud using text-to-speech. Use this to provide audio feedback to the user.",
  {
    message: z.string().describe("The message to speak"),
    voice: z
      .enum(["alex", "sam", "jordan", "casey", "morgan"])
      .optional()
      .describe("Voice to use (default: alex)"),
    speed: z
      .enum(["fast", "normal", "slow"])
      .optional()
      .describe("Speech speed (default: normal)"),
    priority: z
      .enum(["critical", "high", "normal", "low"])
      .optional()
      .describe("Message priority - critical bypasses quiet hours"),
    whisper: z
      .boolean()
      .optional()
      .describe("Soft, breathy voice style (native on some providers, volume fallback on others)"),
  },
  async ({ message, voice, speed, priority, whisper }) => {
    try {
      // Check quiet hours (skip for critical priority)
      if (priority !== "critical" && (await isQuietTime())) {
        return {
          content: [{ type: "text", text: "Message skipped - quiet hours active" }],
        };
      }

      const apiKey = await getApiKey();
      const config = await loadConfig();
      const voiceName = voice ?? process.env.TALKBACK_VOICE ?? getDefaultVoice(config.voiceGender);
      const voiceConfig = getVoice(voiceName);
      const speechSpeed: SpeechSpeed = speed ?? "normal";

      if (!voiceConfig) {
        return {
          content: [{ type: "text", text: `Unknown voice: ${voiceName}` }],
          isError: true,
        };
      }

      // Process text
      const processed = processForSpeech(message.slice(0, 500));
      const useWhisper = whisper ?? false;

      // Check cache first (include whisper in cache key)
      const cacheKey: CacheKey = {
        text: processed,
        voiceId: `${voiceConfig.elevenLabsId}${useWhisper ? ":whisper" : ""}`,
        speed: speechSpeed,
      };

      let audio = await getFromCache(cacheKey);

      if (!audio) {
        if (!apiKey) {
          // Try local TTS
          if (await isLocalTTSAvailable()) {
            await speakLocal(processed, { speed: speechSpeed });
            return {
              content: [{ type: "text", text: `Spoke (local): "${message.slice(0, 50)}..."` }],
            };
          }
          return {
            content: [{ type: "text", text: "No API key configured. Run: talkback setup" }],
            isError: true,
          };
        }

        // Check budget
        const { allowed } = await checkBudget(processed.length);
        if (!allowed) {
          if (await isLocalTTSAvailable()) {
            await speakLocal(processed, { speed: speechSpeed });
            return {
              content: [{ type: "text", text: `Spoke (local, budget exceeded): "${message.slice(0, 50)}..."` }],
            };
          }
          return {
            content: [{ type: "text", text: "Daily budget exceeded" }],
            isError: true,
          };
        }

        // Call API
        audio = await textToSpeech(apiKey, {
          text: processed,
          voiceId: voiceConfig.elevenLabsId,
          speed: speechSpeed,
          whisper: useWhisper,
        });

        await saveToCache(cacheKey, audio);
        await recordUsage(processed.length);
      }

      // Apply volume reduction for whisper mode (ElevenLabs applies partial whisper via voice settings)
      const volume = useWhisper ? getWhisperVolume() : undefined;
      await playAudio(audio, { volume });

      return {
        content: [{ type: "text", text: `Spoke: "${message.slice(0, 50)}${message.length > 50 ? "..." : ""}"` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: beep ---
server.tool(
  "beep",
  "Play a quick sound effect (success or error beep). Faster than speech for simple notifications.",
  {
    type: z.enum(["success", "error"]).describe("Type of beep to play"),
  },
  async ({ type }) => {
    try {
      await playBeep(type);
      return {
        content: [{ type: "text", text: `Played ${type} beep` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: reserve_voice ---
server.tool(
  "reserve_voice",
  "Reserve a unique voice for this session. Useful when multiple agents are running simultaneously.",
  {},
  async () => {
    try {
      const voiceName = await reserveVoice();
      if (!voiceName) {
        return {
          content: [{ type: "text", text: "All voices are currently reserved" }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Reserved voice: ${voiceName}` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: release_voice ---
server.tool(
  "release_voice",
  "Release a previously reserved voice.",
  {
    voice: z.string().optional().describe("Voice name to release (optional)"),
  },
  async ({ voice }) => {
    try {
      if (await releaseVoice(voice)) {
        return {
          content: [{ type: "text", text: "Voice released" }],
        };
      }
      return {
        content: [{ type: "text", text: "Could not release voice" }],
        isError: true,
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: voice_status ---
server.tool(
  "voice_status",
  "Check which voices are available or reserved.",
  {},
  async () => {
    try {
      const statuses = await getVoiceStatuses();
      const lines = statuses.map((s) => {
        const status = s.available ? "available" : `reserved (PID ${s.pid})`;
        return `${s.voice}: ${status}`;
      });
      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: list_voices ---
server.tool(
  "list_voices",
  "List all available voices with descriptions.",
  {},
  async () => {
    const voices = getAllVoices();
    const config = await loadConfig();
    const defaultVoice = getDefaultVoice(config.voiceGender);
    const lines = Object.entries(voices).map(([key, v]) => {
      const isDefault = key === defaultVoice ? " (default)" : "";
      return `${v.name}: ${v.description}${isDefault}`;
    });
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP Server error:", err);
  process.exit(1);
});
