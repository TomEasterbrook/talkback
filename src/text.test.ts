import { describe, it, expect, beforeEach } from "vitest";
import {
  applyPhonetics,
  stripCode,
  detectSentiment,
  processForSpeech,
  clearProjectConfigCache,
} from "./text.js";

describe("applyPhonetics", () => {
  beforeEach(() => {
    clearProjectConfigCache();
  });

  it("converts npm to N P M", () => {
    expect(applyPhonetics("Run npm install")).toBe("Run N P M install");
  });

  it("converts multiple terms", () => {
    expect(applyPhonetics("Use npm and git")).toBe("Use N P M and git");
  });

  it("is case insensitive", () => {
    expect(applyPhonetics("NPM and npm")).toBe("N P M and N P M");
  });

  it("matches whole words only", () => {
    expect(applyPhonetics("pnpm")).toBe("P N P M");
    expect(applyPhonetics("mynpm")).toBe("mynpm"); // Should not match partial
  });

  it("converts k8s to kubernetes", () => {
    expect(applyPhonetics("Deploy to k8s")).toBe("Deploy to kubernetes");
  });

  it("converts json to jason", () => {
    expect(applyPhonetics("Parse the json")).toBe("Parse the jason");
  });

  it("converts common abbreviations", () => {
    expect(applyPhonetics("Check the api")).toBe("Check the A P I");
    expect(applyPhonetics("Use the cli")).toBe("Use the C L I");
    expect(applyPhonetics("Set the env")).toBe("Set the environment");
  });

  it("handles text with no technical terms", () => {
    const text = "Hello world";
    expect(applyPhonetics(text)).toBe(text);
  });

  it("preserves surrounding text", () => {
    expect(applyPhonetics("Please run npm install and then check git status")).toBe(
      "Please run N P M install and then check git status"
    );
  });
});

describe("stripCode", () => {
  it("removes fenced code blocks", () => {
    const text = "Here is code:\n```javascript\nconst x = 1;\n```\nAnd more text.";
    expect(stripCode(text)).toBe("Here is code: code block And more text.");
  });

  it("removes inline code", () => {
    expect(stripCode("Run `npm install` to start")).toBe("Run code to start");
  });

  it("handles multiple code blocks", () => {
    const text = "First `code` and ```\nblock\n``` and `more`";
    expect(stripCode(text)).toBe("First code and code block and code");
  });

  it("handles text without code", () => {
    expect(stripCode("Hello world")).toBe("Hello world");
  });

  it("cleans up multiple spaces", () => {
    expect(stripCode("Hello    world")).toBe("Hello world");
  });
});

describe("detectSentiment", () => {
  describe("success detection", () => {
    it("detects success keywords", () => {
      expect(detectSentiment("Build succeeded")).toBe("success");
      expect(detectSentiment("Tests passed")).toBe("success");
      expect(detectSentiment("Deployment complete")).toBe("success");
      expect(detectSentiment("Task finished")).toBe("success");
    });

    it("detects success emojis", () => {
      expect(detectSentiment("Done! ✓")).toBe("success");
      expect(detectSentiment("All good 🎉")).toBe("success");
    });
  });

  describe("error detection", () => {
    it("detects error keywords", () => {
      expect(detectSentiment("Build failed")).toBe("error");
      expect(detectSentiment("Error: something went wrong")).toBe("error");
      expect(detectSentiment("Fatal exception occurred")).toBe("error");
    });

    it("detects error emojis", () => {
      expect(detectSentiment("Build failed ❌")).toBe("error");
    });

    it("prioritizes error over success", () => {
      expect(detectSentiment("Success but with error")).toBe("error");
    });
  });

  describe("warning detection", () => {
    it("detects warning keywords", () => {
      expect(detectSentiment("Warning: deprecated API")).toBe("warning");
      expect(detectSentiment("Caution required")).toBe("warning");
    });

    it("detects warning emojis", () => {
      expect(detectSentiment("Check this ⚠️")).toBe("warning");
    });
  });

  describe("neutral detection", () => {
    it("returns neutral for generic text", () => {
      expect(detectSentiment("Hello world")).toBe("neutral");
      expect(detectSentiment("Processing...")).toBe("neutral");
    });
  });
});

describe("processForSpeech", () => {
  beforeEach(() => {
    clearProjectConfigCache();
  });

  it("applies both code stripping and phonetics", () => {
    const input = "Run `npm install` in the cli";
    const result = processForSpeech(input);
    expect(result).toBe("Run code in the C L I");
  });

  it("handles complex text", () => {
    const input = "Deploy to k8s using:\n```\nkubectl apply\n```\nCheck the api status.";
    const result = processForSpeech(input);
    expect(result).toBe("Deploy to kubernetes using: code block Check the A P I status.");
  });

  it("handles text with no modifications needed", () => {
    expect(processForSpeech("Hello world")).toBe("Hello world");
  });
});
