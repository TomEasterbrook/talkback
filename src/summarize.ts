/**
 * AI-powered text summarization for long messages.
 *
 * Summarizes verbose output (build logs, test results, etc.) into
 * concise spoken messages. Uses fast, cheap LLM APIs to reduce
 * TTS costs by up to 90% while preserving key information.
 *
 * Supported providers:
 * - OpenAI (gpt-4o-mini) - recommended, good balance of quality/cost
 * - Anthropic (claude-3-haiku) - fast and capable
 * - Groq (llama-3.1-8b) - free tier available
 */

import { loadConfig } from "./setup.js";

export type SummaryProvider = "openai" | "anthropic" | "groq";

export interface SummaryConfig {
  provider: SummaryProvider;
  apiKey: string;
  maxOutputChars?: number; // Target summary length (default: 150)
}

interface SummaryResult {
  original: string;
  summary: string;
  originalLength: number;
  summaryLength: number;
  savings: number; // Percentage reduction
}

const DEFAULT_MAX_OUTPUT = 150;
const API_TIMEOUT_MS = 10000;

const SYSTEM_PROMPT = `You are a concise summarizer for developer notifications.
Summarize the input into a brief spoken message (1-2 sentences, max {maxChars} characters).
Focus on: what happened, whether it succeeded/failed, and key numbers.
Use natural speech patterns - this will be read aloud.
Never use markdown, code blocks, or bullet points.
Examples:
- "Build succeeded with 3 warnings"
- "Tests passed: 47 of 47"
- "Deploy failed: connection timeout to production server"`;

/**
 * Summarize text using AI for more natural spoken output.
 * Returns original text if summarization fails or isn't configured.
 */
export async function summarizeText(
  text: string,
  options: { maxChars?: number } = {}
): Promise<SummaryResult> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_OUTPUT;

  // Don't summarize short text
  if (text.length <= maxChars * 1.5) {
    return {
      original: text,
      summary: text,
      originalLength: text.length,
      summaryLength: text.length,
      savings: 0,
    };
  }

  const config = await getSummaryConfig();
  if (!config) {
    // No summarization configured - return original
    return {
      original: text,
      summary: text,
      originalLength: text.length,
      summaryLength: text.length,
      savings: 0,
    };
  }

  try {
    const summary = await callSummaryAPI(config, text, maxChars);
    const savings = Math.round((1 - summary.length / text.length) * 100);

    return {
      original: text,
      summary,
      originalLength: text.length,
      summaryLength: summary.length,
      savings: Math.max(0, savings),
    };
  } catch (err) {
    // Summarization failed - return original text
    console.error(`Summarization failed: ${(err as Error).message}`);
    return {
      original: text,
      summary: text,
      originalLength: text.length,
      summaryLength: text.length,
      savings: 0,
    };
  }
}

/**
 * Get summarization config from environment or config file.
 */
async function getSummaryConfig(): Promise<SummaryConfig | null> {
  // Check environment variables first
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  if (process.env.GROQ_API_KEY) {
    return {
      provider: "groq",
      apiKey: process.env.GROQ_API_KEY,
    };
  }

  // Check config file
  const config = await loadConfig();

  if (config.providers?.openai?.apiKey) {
    return {
      provider: "openai",
      apiKey: config.providers.openai.apiKey,
    };
  }

  // Summarization not configured
  return null;
}

/**
 * Call the appropriate summarization API.
 */
async function callSummaryAPI(
  config: SummaryConfig,
  text: string,
  maxChars: number
): Promise<string> {
  const systemPrompt = SYSTEM_PROMPT.replace("{maxChars}", String(maxChars));

  switch (config.provider) {
    case "openai":
      return callOpenAI(config.apiKey, systemPrompt, text, maxChars);
    case "anthropic":
      return callAnthropic(config.apiKey, systemPrompt, text, maxChars);
    case "groq":
      return callGroq(config.apiKey, systemPrompt, text, maxChars);
    default:
      throw new Error(`Unknown summary provider: ${config.provider}`);
  }
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  text: string,
  maxChars: number
): Promise<string> {
  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      max_tokens: Math.ceil(maxChars / 3), // Rough token estimate
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message ?? `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() ?? text;
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  text: string,
  maxChars: number
): Promise<string> {
  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: Math.ceil(maxChars / 3),
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message ?? `Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0]?.text?.trim() ?? text;
}

async function callGroq(
  apiKey: string,
  systemPrompt: string,
  text: string,
  maxChars: number
): Promise<string> {
  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      max_tokens: Math.ceil(maxChars / 3),
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message ?? `Groq API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() ?? text;
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Summarization timed out after ${API_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Check if summarization is available (API key configured).
 */
export async function isSummarizationAvailable(): Promise<boolean> {
  const config = await getSummaryConfig();
  return config !== null;
}

/**
 * Get the name of the configured summary provider.
 */
export async function getSummaryProviderName(): Promise<string | null> {
  const config = await getSummaryConfig();
  if (!config) return null;

  const names: Record<SummaryProvider, string> = {
    openai: "OpenAI (gpt-4o-mini)",
    anthropic: "Anthropic (claude-3-haiku)",
    groq: "Groq (llama-3.1-8b)",
  };

  return names[config.provider];
}
