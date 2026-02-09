/**
 * Text processing for natural speech.
 *
 * Handles:
 * - Phonetic corrections for tech terms (npm → "N P M")
 * - Project-specific phonetics from .talkback.json
 * - Code block removal for cleaner speech
 * - Pattern detection for auto-adjusting tone
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Project config file name
const PROJECT_CONFIG_FILE = ".talkback.json";

// Cache for project phonetics (to avoid re-reading file on every call)
let projectPhoneticsCache: Record<string, string> | null = null;
let projectPhoneticsCachePath: string | null = null;

// Technical terms that need phonetic spelling for clear pronunciation
const GLOBAL_PHONETIC_MAP: Record<string, string> = {
  // Package managers & tools
  npm: "N P M",
  pnpm: "P N P M",
  yarn: "yarn",
  npx: "N P X",
  pip: "pip",
  pypi: "pie pie",

  // Version control
  git: "git",
  github: "git hub",
  gitlab: "git lab",

  // Languages & runtimes
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  golang: "go lang",
  nodejs: "node J S",
  deno: "dee no",
  bun: "bun",

  // Kubernetes & containers
  k8s: "kubernetes",
  kubectl: "kube control",
  docker: "docker",
  podman: "pod man",

  // Cloud & infrastructure
  aws: "A W S",
  gcp: "G C P",
  cli: "C L I",
  api: "A P I",
  apis: "A P I s",
  url: "U R L",
  urls: "U R L s",
  sql: "sequel",
  nosql: "no sequel",

  // Common abbreviations
  config: "config",
  configs: "configs",
  env: "environment",
  dev: "dev",
  prod: "production",
  repo: "repo",
  repos: "repos",
  deps: "dependencies",
  auth: "auth",
  oauth: "oh auth",
  jwt: "J W T",
  json: "jason",
  yaml: "yammel",
  toml: "tom L",
  css: "C S S",
  html: "H T M L",
  http: "H T T P",
  https: "H T T P S",
  ssh: "S S H",
  ssl: "S S L",
  tls: "T L S",

  // Testing
  ci: "C I",
  cd: "C D",
  cicd: "C I C D",
  qa: "Q A",

  // Misc
  ui: "U I",
  ux: "U X",
  ide: "I D E",
  vscode: "V S code",
  vim: "vim",
  neovim: "neo vim",
  regex: "reg ex",
  stdout: "standard out",
  stderr: "standard error",
  stdin: "standard in",
};

// Patterns that suggest message sentiment
const PATTERNS = {
  success: [
    /\b(success|succeeded|passed|complete|completed|done|finished|ready|built|deployed)\b/i,
    /✓|✔|👍|🎉|💚/,
  ],
  error: [/\b(error|failed|failure|exception|crashed|broken|fatal|critical)\b/i, /✗|✘|❌|🔴|💔/],
  warning: [/\b(warning|warn|deprecated|caution|attention|notice)\b/i, /⚠️|🟡|🟠/],
};

export type Sentiment = "success" | "error" | "warning" | "neutral";

/**
 * Project-specific phonetics configuration.
 */
export interface ProjectConfig {
  phonetics?: Record<string, string>;
}

/**
 * Load project-specific configuration from .talkback.json in cwd.
 * Returns null if no config file exists.
 */
export function loadProjectConfig(): ProjectConfig | null {
  const configPath = join(process.cwd(), PROJECT_CONFIG_FILE);

  // Use cache if we've already loaded this path
  if (projectPhoneticsCachePath === configPath && projectPhoneticsCache !== null) {
    return { phonetics: projectPhoneticsCache };
  }

  if (!existsSync(configPath)) {
    projectPhoneticsCachePath = configPath;
    projectPhoneticsCache = null;
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as ProjectConfig;

    // Validate phonetics is an object of string -> string
    if (config.phonetics && typeof config.phonetics === "object") {
      const valid: Record<string, string> = {};
      for (const [key, value] of Object.entries(config.phonetics)) {
        if (typeof key === "string" && typeof value === "string") {
          valid[key.toLowerCase()] = value;
        }
      }
      projectPhoneticsCache = valid;
      projectPhoneticsCachePath = configPath;
      return { phonetics: valid };
    }

    projectPhoneticsCachePath = configPath;
    projectPhoneticsCache = null;
    return config;
  } catch {
    // Invalid JSON or read error - ignore
    projectPhoneticsCachePath = configPath;
    projectPhoneticsCache = null;
    return null;
  }
}

/**
 * Clear the project phonetics cache. Useful for testing or when cwd changes.
 */
export function clearProjectConfigCache(): void {
  projectPhoneticsCache = null;
  projectPhoneticsCachePath = null;
}

/**
 * Get the merged phonetics map (global + project-specific).
 * Project phonetics take precedence over global ones.
 */
function getMergedPhonetics(): Record<string, string> {
  const projectConfig = loadProjectConfig();
  const projectPhonetics = projectConfig?.phonetics ?? {};

  // Merge: project overrides global
  return { ...GLOBAL_PHONETIC_MAP, ...projectPhonetics };
}

/**
 * Apply phonetic corrections so technical terms are pronounced clearly.
 */
export function applyPhonetics(text: string): string {
  let result = text;
  const phoneticMap = getMergedPhonetics();

  for (const [term, pronunciation] of Object.entries(phoneticMap)) {
    // Match whole words only, case insensitive
    const regex = new RegExp(`\\b${term}\\b`, "gi");
    result = result.replace(regex, pronunciation);
  }

  return result;
}

/**
 * Remove code blocks and inline code for cleaner speech.
 * Keeps the surrounding prose.
 */
export function stripCode(text: string): string {
  return (
    text
      // Remove fenced code blocks (```...```)
      .replace(/```[\s\S]*?```/g, " code block ")
      // Remove inline code (`...`)
      .replace(/`[^`]+`/g, " code ")
      // Clean up multiple spaces
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Detect the sentiment of a message based on common patterns.
 * Returns 'success', 'error', 'warning', or 'neutral'.
 */
export function detectSentiment(text: string): Sentiment {
  for (const pattern of PATTERNS.error) {
    if (pattern.test(text)) return "error";
  }
  for (const pattern of PATTERNS.success) {
    if (pattern.test(text)) return "success";
  }
  for (const pattern of PATTERNS.warning) {
    if (pattern.test(text)) return "warning";
  }
  return "neutral";
}

/**
 * Process text for optimal speech output.
 * Applies all transformations: code stripping and phonetic fixes.
 */
export function processForSpeech(text: string): string {
  let processed = text;
  processed = stripCode(processed);
  processed = applyPhonetics(processed);
  return processed;
}
