# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Talkback is a CLI tool that speaks text aloud using text-to-speech. It's designed for AI coding assistants running in terminals, providing audio feedback without switching windows.

## Build and Development Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Run CLI directly with tsx (no build needed)
npm run start        # Run compiled CLI from dist/

npm run test         # Run tests once
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report

npm run lint         # Check for linting errors
npm run lint:fix     # Fix linting errors
npm run format       # Format code with Prettier
npm run format:check # Check formatting
```

Run the CLI during development:
```bash
npm run dev -- "Hello world"          # Speak a message
npm run dev -- --beep success         # Play a beep
npm run dev -- setup                  # Run setup wizard
```

## Architecture

### Entry Points

- `src/index.ts` - Main CLI entry point using Commander.js. Spawns background process (via `TALKBACK_SYNC` env var) so CLI returns immediately (~50ms) while audio plays
- `src/mcp-server.ts` - MCP server for Claude Code integration. Exposes tools: `speak`, `beep`, `reserve_voice`, `release_voice`, `voice_status`, `list_voices`

### Core Modules

- `src/commands/` - Command handlers split by concern:
  - `speak.ts` - Core speak functionality with queue processing
  - `voice.ts` - Voice listing and reservation management
  - `admin.ts` - Stats, cache, provider, quiet hours, theme management

- `src/providers.ts` - Multi-provider TTS abstraction (ElevenLabs, OpenAI, Azure, AWS Polly, Google Cloud). Factory pattern with `createProvider()`

- `src/api.ts` - ElevenLabs-specific API client with streaming support

- `src/constants.ts` - Shared paths (`~/.talkback/`), file permissions, API settings, speech speed types

### Supporting Modules

- `src/text.ts` - Text processing: phonetics conversion (npm -> "N P M"), code stripping, sentiment detection
- `src/voices.ts` - Voice configuration with US/British accent variants, ElevenLabs voice ID mappings
- `src/player.ts` - Audio playback via sox, beep sounds, voice signatures
- `src/local-tts.ts` - Local TTS fallback (macOS `say`, Linux `espeak`, Piper neural TTS)
- `src/validation.ts` - Zod-style type guards for JSON config/data files
- `src/cache.ts` - Audio caching in `~/.talkback/cache/`
- `src/queue.ts` - Priority message queue with file-based locking
- `src/locks.ts` - Voice reservation for multi-session support
- `src/stats.ts` - Usage tracking and budget management

### Configuration

All config stored in `~/.talkback/`:
- `config.json` - API keys, provider settings, accent preference
- `stats.json` - Usage statistics
- `cache/` - Cached audio files
- `locks/` - Voice reservation lock files

Project-level `.talkback.json` for custom phonetics.

## Key Patterns

- **Background execution**: CLI spawns detached child process and exits immediately. Child does actual TTS work
- **Provider abstraction**: `TTSProvider` interface with factory function, providers implement `synthesize()`, `validateCredentials()`, `listVoices()`
- **Graceful fallback**: API failure -> local TTS (Piper -> say/espeak)
- **Type-safe JSON**: All JSON files validated with type guards before use (`isValidConfig()`, `parseStats()`, etc.)

## Testing

Tests use Vitest with `.test.ts` suffix. Test files live alongside source files.

```bash
npm run test                           # Run all tests
npm run test -- src/text.test.ts       # Run single test file
npm run test -- --reporter=verbose     # Verbose output
```

## Code Style

- ESM modules with `.js` extensions in imports (compiled output)
- Unused variables prefixed with `_`
- Prettier for formatting
- TypeScript strict mode enabled
