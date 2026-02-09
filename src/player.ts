/**
 * Audio playback using sox (the `play` command).
 *
 * Sox is a cross-platform audio tool that handles MP3 playback
 * and can generate simple beep sounds for notifications.
 */

import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getCurrentTheme, soundSpecToSoxArgs } from "./themes.js";

export async function playAudio(audioBuffer: Buffer): Promise<void> {
  const tempFile = join(tmpdir(), `talkback-${randomBytes(8).toString("hex")}.mp3`);

  try {
    await writeFile(tempFile, audioBuffer);
    await runPlay(["-q", tempFile]);
  } finally {
    await unlink(tempFile).catch(() => {});
  }
}

export async function playBeep(type: "success" | "error"): Promise<void> {
  const theme = await getCurrentTheme();
  const spec = type === "success" ? theme.successBeep : theme.errorBeep;
  await runPlay(soundSpecToSoxArgs(spec));
}

export async function playVoiceSignature(frequencyHz: number): Promise<void> {
  const theme = await getCurrentTheme();
  const args = soundSpecToSoxArgs(theme.signatureBase, frequencyHz);
  await runPlay(args);
}

export async function isSoxInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const process = spawn("which", ["play"]);
    process.on("close", (code) => resolve(code === 0));
    process.on("error", () => resolve(false));
  });
}

function runPlay(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn("play", args, {
      stdio: ["ignore", "ignore", "ignore"],
    });

    process.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "sox not found. Install with: brew install sox (macOS) or apt install sox (Linux)"
          )
        );
      } else {
        reject(err);
      }
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`play exited with code ${code}`));
      }
    });
  });
}
