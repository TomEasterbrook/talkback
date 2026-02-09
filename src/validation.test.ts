import { describe, it, expect } from "vitest";
import {
  isValidConfig,
  parseConfig,
  isValidMessageQueue,
  parseMessageQueue,
  isValidStats,
  parseStats,
  isValidLockFile,
  parseLockFile,
  defaultConfig,
  defaultMessageQueue,
  defaultStats,
} from "./validation.js";

describe("Config validation", () => {
  describe("isValidConfig", () => {
    it("accepts empty config", () => {
      expect(isValidConfig({})).toBe(true);
    });

    it("accepts valid config with all fields", () => {
      expect(
        isValidConfig({
          apiKey: "test-key",
          accent: "us",
          localFallback: true,
          provider: "elevenlabs",
        })
      ).toBe(true);
    });

    it("accepts british accent", () => {
      expect(isValidConfig({ accent: "british" })).toBe(true);
    });

    it("rejects invalid accent", () => {
      expect(isValidConfig({ accent: "australian" })).toBe(false);
    });

    it("rejects non-string apiKey", () => {
      expect(isValidConfig({ apiKey: 123 })).toBe(false);
    });

    it("rejects non-boolean localFallback", () => {
      expect(isValidConfig({ localFallback: "yes" })).toBe(false);
    });

    it("rejects invalid provider", () => {
      expect(isValidConfig({ provider: "invalid" })).toBe(false);
    });

    it("accepts all valid providers", () => {
      const providers = ["elevenlabs", "openai", "azure", "aws", "google"];
      for (const provider of providers) {
        expect(isValidConfig({ provider })).toBe(true);
      }
    });

    it("rejects null", () => {
      expect(isValidConfig(null)).toBe(false);
    });

    it("rejects non-object", () => {
      expect(isValidConfig("string")).toBe(false);
    });
  });

  describe("parseConfig", () => {
    it("parses valid JSON config", () => {
      const config = parseConfig('{"apiKey": "test", "accent": "us"}');
      expect(config.apiKey).toBe("test");
      expect(config.accent).toBe("us");
    });

    it("throws on invalid JSON", () => {
      expect(() => parseConfig("not json")).toThrow();
    });

    it("throws on invalid config structure", () => {
      expect(() => parseConfig('{"accent": "invalid"}')).toThrow("Invalid config file format");
    });
  });
});

describe("Message queue validation", () => {
  describe("isValidMessageQueue", () => {
    it("accepts empty array", () => {
      expect(isValidMessageQueue([])).toBe(true);
    });

    it("accepts valid message", () => {
      expect(
        isValidMessageQueue([
          {
            text: "Hello",
            voiceId: "voice-123",
            voiceName: "Test Voice",
            speed: "normal",
            queuedAt: "2024-01-01T00:00:00Z",
          },
        ])
      ).toBe(true);
    });

    it("accepts all speed values", () => {
      const speeds = ["fast", "normal", "slow"];
      for (const speed of speeds) {
        expect(
          isValidMessageQueue([
            {
              text: "Hello",
              voiceId: "voice-123",
              voiceName: "Test",
              speed,
              queuedAt: "2024-01-01T00:00:00Z",
            },
          ])
        ).toBe(true);
      }
    });

    it("rejects invalid speed", () => {
      expect(
        isValidMessageQueue([
          {
            text: "Hello",
            voiceId: "voice-123",
            voiceName: "Test",
            speed: "ultra-fast",
            queuedAt: "2024-01-01T00:00:00Z",
          },
        ])
      ).toBe(false);
    });

    it("rejects non-array", () => {
      expect(isValidMessageQueue({})).toBe(false);
    });

    it("rejects message with missing fields", () => {
      expect(isValidMessageQueue([{ text: "Hello" }])).toBe(false);
    });
  });

  describe("parseMessageQueue", () => {
    it("parses valid queue", () => {
      const queue = parseMessageQueue(
        JSON.stringify([
          {
            text: "Hello",
            voiceId: "v1",
            voiceName: "Voice",
            speed: "normal",
            queuedAt: "2024-01-01",
          },
        ])
      );
      expect(queue).toHaveLength(1);
      expect(queue[0].text).toBe("Hello");
    });

    it("throws on invalid queue", () => {
      expect(() => parseMessageQueue('[{"invalid": true}]')).toThrow("Invalid queue file format");
    });
  });
});

describe("Stats validation", () => {
  describe("isValidStats", () => {
    it("accepts valid stats", () => {
      expect(
        isValidStats({
          totalCharacters: 1000,
          totalMessages: 10,
          dailyUsage: [],
        })
      ).toBe(true);
    });

    it("accepts stats with daily usage", () => {
      expect(
        isValidStats({
          totalCharacters: 1000,
          totalMessages: 10,
          dailyUsage: [{ date: "2024-01-01", characters: 100, messages: 5 }],
        })
      ).toBe(true);
    });

    it("accepts stats with optional dailyBudget", () => {
      expect(
        isValidStats({
          totalCharacters: 1000,
          totalMessages: 10,
          dailyUsage: [],
          dailyBudget: 5000,
        })
      ).toBe(true);
    });

    it("accepts daily usage with warnedThresholds", () => {
      expect(
        isValidStats({
          totalCharacters: 1000,
          totalMessages: 10,
          dailyUsage: [
            { date: "2024-01-01", characters: 100, messages: 5, warnedThresholds: [75, 90] },
          ],
        })
      ).toBe(true);
    });

    it("rejects missing required fields", () => {
      expect(isValidStats({ totalCharacters: 1000 })).toBe(false);
    });

    it("rejects non-number dailyBudget", () => {
      expect(
        isValidStats({
          totalCharacters: 1000,
          totalMessages: 10,
          dailyUsage: [],
          dailyBudget: "5000",
        })
      ).toBe(false);
    });
  });

  describe("parseStats", () => {
    it("parses valid stats", () => {
      const stats = parseStats(
        JSON.stringify({
          totalCharacters: 500,
          totalMessages: 5,
          dailyUsage: [],
        })
      );
      expect(stats.totalCharacters).toBe(500);
    });

    it("migrates legacy format", () => {
      const stats = parseStats(
        JSON.stringify({
          total: { characters: 100, messages: 2 },
          daily: [{ date: "2024-01-01", characters: 50, messages: 1 }],
          budget: { dailyLimit: 1000 },
        })
      );
      expect(stats.totalCharacters).toBe(100);
      expect(stats.totalMessages).toBe(2);
      expect(stats.dailyBudget).toBe(1000);
      expect(stats.dailyUsage).toHaveLength(1);
    });
  });
});

describe("Lock file validation", () => {
  describe("isValidLockFile", () => {
    it("accepts valid lock file", () => {
      expect(isValidLockFile({ pid: 12345, reservedAt: "2024-01-01T00:00:00Z" })).toBe(true);
    });

    it("rejects missing pid", () => {
      expect(isValidLockFile({ reservedAt: "2024-01-01T00:00:00Z" })).toBe(false);
    });

    it("rejects non-number pid", () => {
      expect(isValidLockFile({ pid: "12345", reservedAt: "2024-01-01T00:00:00Z" })).toBe(false);
    });
  });

  describe("parseLockFile", () => {
    it("parses valid lock file", () => {
      const lock = parseLockFile(JSON.stringify({ pid: 999, reservedAt: "2024-01-01" }));
      expect(lock.pid).toBe(999);
    });

    it("throws on invalid lock file", () => {
      expect(() => parseLockFile('{"invalid": true}')).toThrow("Invalid lock file format");
    });
  });
});

describe("Default values", () => {
  it("returns empty default config", () => {
    expect(defaultConfig()).toEqual({});
  });

  it("returns empty default message queue", () => {
    expect(defaultMessageQueue()).toEqual([]);
  });

  it("returns default stats with zeroes", () => {
    expect(defaultStats()).toEqual({
      totalCharacters: 0,
      totalMessages: 0,
      dailyUsage: [],
    });
  });
});
