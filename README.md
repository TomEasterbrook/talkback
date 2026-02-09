# Talkback

**Voice for agentic coders** — A CLI tool that speaks text aloud using ElevenLabs.

Designed for AI coding assistants running in terminals. When you're running multiple coding sessions, audio feedback lets you know what's happening without switching windows.

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Link for global use
npm link

# Configure your ElevenLabs API key
talkback setup

# Speak!
talkback Build complete
```

## Usage

```bash
# Basic usage
talkback Hello world

# Choose a voice
talkback -v sam "Tests passed"

# Quick sound effects (no API cost)
talkback --beep success
talkback --beep error

# Faster/slower speech
talkback --speed fast "Urgent message"
talkback --speed slow "Let me explain"
```

## Voices

Five friendly voice names, available in US or British accents:

| Name   | Description          |
|--------|---------------------|
| alex   | Clear, neutral (default) |
| sam    | Warm female          |
| jordan | Energetic male       |
| casey  | Calm female          |
| morgan | Deep male            |

```bash
# List voices
talkback voices

# Change accent
talkback setup
```

## Multi-Session Support

When running multiple AI coding sessions, reserve different voices so you can tell them apart:

```bash
# At session start
export TALKBACK_VOICE=$(talkback reserve)

# All messages now use your reserved voice
talkback "Working on frontend"

# At session end
talkback release

# Check what's in use
talkback status
```

## Cost Control

ElevenLabs charges per character. Talkback helps you manage costs:

```bash
# View usage statistics
talkback stats

# Set a daily budget (in characters)
talkback stats --budget 10000

# Remove budget
talkback stats --budget none

# Messages auto-truncate at 500 chars (configurable)
talkback -m 100 "This long message will be cut..."
```

## Commands

| Command | Description |
|---------|-------------|
| `setup` | Configure API key and accent |
| `voices` | List available voices |
| `stats` | Show usage and cost |
| `reserve` | Reserve a voice for this session |
| `release` | Release your reserved voice |
| `status` | Show voice reservations |

## Options

| Option | Description |
|--------|-------------|
| `-v, --voice <name>` | Voice: alex, sam, jordan, casey, morgan |
| `--speed <speed>` | fast, normal, slow |
| `-m, --max-length <n>` | Truncate messages (default: 500) |
| `-b, --beep <type>` | Quick sound: success, error |
| `--no-prefix` | Don't prefix with "Alex says:" |
| `--budget <n>` | Set daily character limit |

## Requirements

- Node.js 18+
- [sox](http://sox.sourceforge.net/) for audio playback
- ElevenLabs API key

```bash
# Install sox
brew install sox        # macOS
apt install sox         # Linux
choco install sox       # Windows
```

## Configuration

Config is stored in `~/.talkback/`:

- `config.json` — API key and accent preference
- `stats.json` — Usage statistics
- `locks/` — Voice reservations
- `queue.json` — Message queue

## Smart Features

### Phonetic Corrections

Technical terms are pronounced clearly:

| You type | Spoken as |
|----------|-----------|
| npm | "N P M" |
| kubectl | "kube control" |
| k8s | "kubernetes" |
| json | "jason" |
| sql | "sequel" |

### Code-Aware Parsing

Code blocks are stripped for cleaner speech:

```bash
# Input with code block
talkback "Fixed the bug: \`return null\` was wrong"

# Speaks: "Fixed the bug: code was wrong"
```

### Auto-Detection

Errors and successes are detected automatically and prefixed with a beep:

```bash
talkback "Build failed with 3 errors"   # 🔊 error beep + speech
talkback "Tests passed!"                 # 🔊 success beep + speech
talkback "Starting build"                # speech only
```

## Git Integration

Announce git events automatically:

```bash
# Check current status
talkback git

# Install hooks (post-commit, post-checkout, pre-push, post-merge)
talkback git install

# Remove hooks
talkback git uninstall
```

Once installed, you'll hear:
- "Committed: fix login bug" after commits
- "Switched to feature-branch" when changing branches
- "Pushing main" before pushes
- "Merge complete" after merges

## How It Works

```
text → phonetics → strip code → detect sentiment → ElevenLabs API → sox play
```

1. **Text Processing** — Phonetic fixes, code stripping, sentiment detection
2. **Voices** — Human names map to ElevenLabs voice IDs
3. **Queue** — Rapid messages are queued and played in order
4. **Locks** — File-based locks prevent audio overlap
5. **Stats** — Track usage for cost awareness

## Files

```
src/
├── index.ts    CLI entry point
├── api.ts      ElevenLabs TTS client
├── player.ts   Sox audio playback
├── voices.ts   Voice configuration
├── text.ts     Phonetics, code stripping, sentiment
├── stats.ts    Usage tracking
├── locks.ts    Voice reservation
├── queue.ts    Message queue
├── setup.ts    Setup wizard
└── git.ts      Git hooks management
```

## Security

### API Key Management

Your ElevenLabs API key is sensitive. Talkback provides two options:

**Option 1: Environment Variable (Recommended)**
```bash
export ELEVENLABS_API_KEY="your-key-here"
```
This keeps your key out of the filesystem and works well with secrets managers.

**Option 2: Config File**
The `setup` command stores your key in `~/.talkback/config.json` with restricted permissions (owner read/write only). While convenient, environment variables are more secure.

### Git Hooks

Git hooks installed by `talkback git install` sanitize commit messages and branch names to prevent shell injection. The hooks strip potentially dangerous characters before passing data to commands.

### Data Files

All data files (`stats.json`, `queue.json`, lock files) are validated on load. Corrupted files are reset to defaults rather than causing undefined behavior.

### Network Security

- All API calls use HTTPS
- Requests have a 30-second timeout to prevent hanging
- Only whitelisted environment variables are passed to child processes

## License

MIT
