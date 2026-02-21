/**
 * Command module exports.
 */

export { speak, type SpeakOptions } from "./speak.js";
export { showVoices, showStatus, handleReserve, handleRelease } from "./voice.js";
export { runVoiceSetup } from "./voice-setup.js";
export {
  handleStats,
  handleGit,
  handleCache,
  handleProvider,
  handleQuiet,
  handleTheme,
  handlePiper,
  type StatsOptions,
} from "./admin.js";
