/**
 * Git hooks integration for Talkback.
 *
 * Provides commands to install/uninstall git hooks that announce
 * git events like commits, pushes, and branch switches.
 */

import { writeFile, unlink, chmod, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// Sanitize function removes shell metacharacters to prevent injection
// This is embedded in hooks to avoid external dependencies
const SANITIZE_FUNC = `
# Talkback: Sanitize input to prevent shell injection
sanitize() {
  printf '%s' "$1" | tr -d '\`$\\!(){}[]|;&<>\\n\\r' | cut -c1-200
}
`;

const HOOKS = {
  "post-commit": `#!/bin/sh
# Talkback: Announce commits
${SANITIZE_FUNC}
MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "commit")
MSG=$(sanitize "$MSG")
talkback "Committed: $MSG"
`,

  "post-checkout": `#!/bin/sh
# Talkback: Announce branch switches
# $3 is 1 for branch checkout, 0 for file checkout
${SANITIZE_FUNC}
if [ "$3" = "1" ]; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "branch")
  BRANCH=$(sanitize "$BRANCH")
  talkback "Switched to $BRANCH"
fi
`,

  "pre-push": `#!/bin/sh
# Talkback: Announce pushes
${SANITIZE_FUNC}
BRANCH=$(git branch --show-current 2>/dev/null || echo "branch")
BRANCH=$(sanitize "$BRANCH")
talkback "Pushing $BRANCH"
`,

  "post-merge": `#!/bin/sh
# Talkback: Announce merges
talkback "Merge complete"
`,
};

type HookName = keyof typeof HOOKS;

// Whitelist of safe environment variables to pass to git commands
const SAFE_ENV_VARS = ["PATH", "HOME", "USER", "LANG", "LC_ALL", "GIT_DIR", "GIT_WORK_TREE"];

function getSafeEnv(): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_VARS) {
    if (process.env[key]) {
      safeEnv[key] = process.env[key];
    }
  }
  return safeEnv;
}

function getGitRoot(): string | null {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      env: getSafeEnv(),
    }).trim();
  } catch {
    return null;
  }
}

function getHooksDir(): string | null {
  const root = getGitRoot();
  return root ? join(root, ".git", "hooks") : null;
}

export async function installHooks(
  hooks: HookName[] = Object.keys(HOOKS) as HookName[]
): Promise<string[]> {
  const hooksDir = getHooksDir();
  if (!hooksDir) {
    throw new Error("Not in a git repository");
  }

  // Ensure hooks directory exists
  await mkdir(hooksDir, { recursive: true });

  const installed: string[] = [];

  for (const hook of hooks) {
    const hookPath = join(hooksDir, hook);
    const content = HOOKS[hook];

    // Check if hook already exists
    if (existsSync(hookPath)) {
      const existing = await readFile(hookPath, "utf-8");
      if (existing.includes("Talkback")) {
        continue; // Already installed
      }
      // Append to existing hook
      await writeFile(hookPath, existing + "\n" + content);
    } else {
      await writeFile(hookPath, content);
    }

    await chmod(hookPath, 0o755);
    installed.push(hook);
  }

  return installed;
}

export async function uninstallHooks(): Promise<string[]> {
  const hooksDir = getHooksDir();
  if (!hooksDir) {
    throw new Error("Not in a git repository");
  }

  const removed: string[] = [];

  for (const hook of Object.keys(HOOKS) as HookName[]) {
    const hookPath = join(hooksDir, hook);

    if (!existsSync(hookPath)) continue;

    const content = await readFile(hookPath, "utf-8");
    if (!content.includes("Talkback")) continue;

    // Check if it's only our hook or mixed
    const lines = content.split("\n");
    const ourLines = lines.filter(
      (l) => l.includes("Talkback") || l.includes("talkback") || l.startsWith("#!")
    );

    if (ourLines.length === lines.filter((l) => l.trim()).length) {
      // It's entirely our hook, remove it
      await unlink(hookPath);
    } else {
      // Mixed hook, remove our parts
      const cleaned = lines
        .filter((l) => !l.includes("Talkback") && !l.includes("talkback"))
        .join("\n");
      await writeFile(hookPath, cleaned);
    }

    removed.push(hook);
  }

  return removed;
}

export function getAvailableHooks(): string[] {
  return Object.keys(HOOKS);
}

export async function showHooksStatus(): Promise<void> {
  const hooksDir = getHooksDir();

  if (!hooksDir) {
    console.log("\nNot in a git repository\n");
    return;
  }

  console.log("\nGit hooks status:\n");

  for (const hook of Object.keys(HOOKS)) {
    const hookPath = join(hooksDir, hook);
    let status = "not installed";

    if (existsSync(hookPath)) {
      const content = await readFile(hookPath, "utf-8");
      status = content.includes("Talkback") ? "✓ installed" : "exists (not talkback)";
    }

    console.log(`  ${hook.padEnd(15)} ${status}`);
  }

  console.log("\nInstall: talkback git install");
  console.log("Remove:  talkback git uninstall\n");
}
