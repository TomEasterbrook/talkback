/**
 * Administrative commands.
 *
 * Handles stats, cache, git hooks, providers, quiet hours, and themes.
 */

import { setBudget, formatStats } from "../stats.js";
import { installHooks, uninstallHooks, showHooksStatus } from "../git.js";
import { clearCache, getCacheStats } from "../cache.js";
import { loadConfig, saveConfig } from "../setup.js";
import { getProviderNames, type ProviderName } from "../providers.js";
import { parseQuietHours, setQuietHours, disableQuietHours, formatQuietStatus } from "../quiet.js";
import { getCurrentTheme, setTheme, getAllThemes, getThemeNames, isValidTheme } from "../themes.js";
import { playBeep } from "../player.js";
import { buildProviderConfig } from "./speak.js";

// --- Stats ---

export interface StatsOptions {
  budget?: string;
}

export async function handleStats(options: StatsOptions): Promise<void> {
  if (options.budget) {
    if (options.budget === "none" || options.budget === "off") {
      await setBudget(null);
      console.log("Budget removed");
    } else {
      const budget = parseInt(options.budget, 10);
      if (budget > 0) {
        await setBudget(budget);
        console.log(`Daily budget set to ${budget.toLocaleString()} characters`);
      }
    }
  } else {
    console.log(await formatStats());
  }
}

// --- Git Hooks ---

export async function handleGit(subcommand?: string): Promise<void> {
  switch (subcommand) {
    case "install": {
      const installed = await installHooks();
      if (installed.length > 0) {
        console.log(`Installed hooks: ${installed.join(", ")}`);
        console.log("\nGit will now announce commits, branch switches, and pushes.");
      } else {
        console.log("Hooks already installed");
      }
      break;
    }
    case "uninstall": {
      const removed = await uninstallHooks();
      if (removed.length > 0) {
        console.log(`Removed hooks: ${removed.join(", ")}`);
      } else {
        console.log("No talkback hooks found");
      }
      break;
    }
    default:
      await showHooksStatus();
  }
}

// --- Cache ---

export async function handleCache(subcommand?: string): Promise<void> {
  if (subcommand === "clear") {
    const count = await clearCache();
    console.log(`Cleared ${count} cached audio files`);
    return;
  }

  const stats = await getCacheStats();
  console.log("\nAudio Cache Stats\n");
  console.log(`  Cached phrases: ${stats.entries}`);
  console.log(`  Cache size:     ${stats.sizeMB} MB`);
  console.log("\nCommands:");
  console.log("  talkback cache clear    Clear all cached audio\n");
}

// --- Provider ---

export async function handleProvider(subcommand?: string, value?: string): Promise<void> {
  const config = await loadConfig();
  const providers = getProviderNames();

  if (subcommand === "list") {
    console.log("\nAvailable TTS Providers:\n");
    for (const p of providers) {
      const active = config.provider === p.name ? " (active)" : "";
      const configured = isProviderConfigured(config, p.name) ? "+" : " ";
      console.log(`  ${configured} ${p.name.padEnd(12)} ${p.displayName}${active}`);
    }
    console.log("\nCommands:");
    console.log("  talkback provider set <name>   Switch to a provider");
    console.log("  talkback provider add <name>   Configure a provider\n");
    return;
  }

  if (subcommand === "set" && value) {
    const providerName = value as ProviderName;
    if (!providers.find((p) => p.name === providerName)) {
      console.error(`Unknown provider: ${value}`);
      console.error(`Available: ${providers.map((p) => p.name).join(", ")}`);
      process.exit(1);
    }

    if (!isProviderConfigured(config, providerName)) {
      console.error(
        `Provider ${providerName} not configured. Run: talkback provider add ${providerName}`
      );
      process.exit(1);
    }

    await saveConfig({ ...config, provider: providerName });
    console.log(`Switched to ${providerName}`);
    return;
  }

  if (subcommand === "add" && value) {
    await configureProvider(value as ProviderName);
    return;
  }

  const current = config.provider ?? "elevenlabs";
  const providerInfo = providers.find((p) => p.name === current);
  console.log(`\nCurrent provider: ${providerInfo?.displayName ?? current}`);
  console.log("\nRun 'talkback provider list' to see all providers\n");
}

function isProviderConfigured(
  config: Awaited<ReturnType<typeof loadConfig>>,
  name: ProviderName
): boolean {
  if (name === "elevenlabs") {
    return !!(
      config.apiKey ||
      config.providers?.elevenlabs?.apiKey ||
      process.env.ELEVENLABS_API_KEY
    );
  }

  const envVars: Record<ProviderName, string[]> = {
    elevenlabs: ["ELEVENLABS_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    azure: ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"],
    aws: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
    google: ["GOOGLE_API_KEY"],
  };

  const vars = envVars[name];
  if (vars.every((v) => process.env[v])) {
    return true;
  }

  return !!config.providers?.[name];
}

async function configureProvider(name: ProviderName): Promise<void> {
  const { createInterface } = await import("node:readline");

  const prompt = (question: string): Promise<string> => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  };

  const config = await loadConfig();
  config.providers = config.providers ?? {};

  console.log(`\nConfiguring ${name}...\n`);

  switch (name) {
    case "elevenlabs": {
      console.log("Get your API key at: https://elevenlabs.io/app/settings/api-keys\n");
      const apiKey = await prompt("API Key: ");
      if (!apiKey) {
        console.log("Cancelled");
        return;
      }
      config.providers.elevenlabs = { apiKey };
      config.apiKey = apiKey;
      break;
    }
    case "openai": {
      console.log("Get your API key at: https://platform.openai.com/api-keys\n");
      const apiKey = await prompt("API Key: ");
      if (!apiKey) {
        console.log("Cancelled");
        return;
      }
      config.providers.openai = { apiKey };
      break;
    }
    case "azure": {
      console.log("Get credentials from Azure Portal > Speech Services\n");
      const apiKey = await prompt("Speech Key: ");
      const region = await prompt("Region (e.g., eastus): ");
      if (!apiKey || !region) {
        console.log("Cancelled");
        return;
      }
      config.providers.azure = { apiKey, region };
      break;
    }
    case "aws": {
      console.log("Create IAM credentials with Polly access\n");
      const accessKeyId = await prompt("Access Key ID: ");
      const secretAccessKey = await prompt("Secret Access Key: ");
      const region = await prompt("Region (e.g., us-east-1): ");
      if (!accessKeyId || !secretAccessKey || !region) {
        console.log("Cancelled");
        return;
      }
      config.providers.aws = { accessKeyId, secretAccessKey, region };
      break;
    }
    case "google": {
      console.log("Get your API key from Google Cloud Console > APIs & Services\n");
      const apiKey = await prompt("API Key: ");
      if (!apiKey) {
        console.log("Cancelled");
        return;
      }
      config.providers.google = { apiKey };
      break;
    }
  }

  await saveConfig(config);
  console.log(`\n+ ${name} configured`);

  const setActive = await prompt(`\nSet ${name} as active provider? [Y/n] `);
  if (setActive.toLowerCase() !== "n") {
    config.provider = name;
    await saveConfig(config);
    console.log(`+ ${name} is now active`);
  }
}

// --- Quiet Hours ---

export async function handleQuiet(times?: string): Promise<void> {
  if (!times) {
    console.log(await formatQuietStatus());
    return;
  }

  if (times === "off" || times === "disable") {
    await disableQuietHours();
    console.log("Quiet hours disabled");
    return;
  }

  const ranges = parseQuietHours(times);
  if (ranges.length === 0) {
    console.error("Invalid time format. Examples: 9am-10am, 14:00-15:00, 9-10");
    process.exit(1);
  }

  await setQuietHours(ranges);
  console.log(await formatQuietStatus());
}

// --- Theme ---

export async function handleTheme(name?: string): Promise<void> {
  if (!name) {
    const current = await getCurrentTheme();
    console.log(`\nCurrent theme: ${current.displayName}\n`);
    console.log("Available themes:\n");
    for (const theme of getAllThemes()) {
      const marker = theme.name === current.name ? " <- current" : "";
      console.log(`  ${theme.name.padEnd(10)} ${theme.description}${marker}`);
    }
    console.log(`\nSet theme: talkback theme <name>\n`);
    return;
  }

  if (!isValidTheme(name)) {
    console.error(`Unknown theme: ${name}`);
    console.error(`Available: ${getThemeNames().join(", ")}`);
    process.exit(1);
  }

  await setTheme(name);
  const theme = await getCurrentTheme();
  console.log(`Theme set to: ${theme.displayName}`);

  await playBeep("success");
}
