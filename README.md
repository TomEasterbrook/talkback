# Talkback

**Voice for agentic coders** — A CLI tool that speaks text aloud using multiple TTS providers.

Designed for AI coding assistants running in terminals. When you're running multiple coding sessions, audio feedback lets you know what's happening without switching windows.

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Link for global use
npm link

# Configure your API key
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

# Use local TTS (free, works offline)
talkback --local "No API needed"

```

Talkback always returns immediately (~50ms) while audio plays in the background - perfect for agents that don't want to block.

## TTS Providers

Talkback supports multiple text-to-speech providers:

| Provider | Description |
|----------|-------------|
| **elevenlabs** | High quality voices (default) |
| **openai** | Simple pricing, good quality |
| **azure** | Enterprise, many languages |
| **aws** | AWS Polly, cost-effective |
| **google** | Google Cloud TTS, multilingual |

```bash
# List available providers
talkback provider list

# Add a new provider
talkback provider add openai

# Switch providers
talkback provider set openai
```

### Local TTS Fallback

When the API is unavailable or you're over budget, Talkback can fall back to local TTS:

- **macOS**: Uses built-in `say` command
- **Linux**: Uses `espeak` or `espeak-ng`

```bash
# Force local TTS
talkback --local "This uses system TTS"

# Enable automatic fallback in config
# (falls back when API fails or budget exceeded)
```

## Voices

Five friendly voice names, available in US or British accents:

| Name   | Description          | Signature |
|--------|---------------------|-----------|
| alex   | Clear, neutral (default) | C note |
| sam    | Warm female          | E note |
| jordan | Energetic male       | G note |
| casey  | Calm female          | D note |
| morgan | Deep male            | A note |

Each voice has a unique musical signature tone (a brief note before speaking) so you can identify which voice is speaking without verbal prefixes.

```bash
# List voices
talkback voices

# Change accent
talkback setup

# Skip the signature tone
talkback --no-signature "Just the message"
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

## Audio Caching

Talkback caches TTS audio locally to reduce API calls and latency:

```bash
# View cache statistics
talkback cache

# Clear the cache
talkback cache clear
```

- Cache location: `~/.talkback/cache/`
- Max size: 50 MB (auto-cleanup)
- Max age: 30 days
- Repeated phrases play instantly from cache

## Cost Control

ElevenLabs and other providers charge per character. Talkback helps you manage costs:

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
| `cache` | Manage audio cache |
| `provider` | Manage TTS providers |
| `reserve` | Reserve a voice for this session |
| `release` | Release your reserved voice |
| `status` | Show voice reservations |
| `git` | Manage git hooks |

## Options

| Option | Description |
|--------|-------------|
| `-v, --voice <name>` | Voice: alex, sam, jordan, casey, morgan |
| `--speed <speed>` | fast, normal, slow |
| `-m, --max-length <n>` | Truncate messages (default: 500) |
| `-b, --beep <type>` | Quick sound: success, error |
| `-l, --local` | Use local TTS instead of API |
| `--no-signature` | Skip the voice signature tone |
| `-V, --version` | Show version number |

## Requirements

- Node.js 18+
- [sox](http://sox.sourceforge.net/) for audio playback
- API key for your chosen provider (or use local TTS)

```bash
# Install sox
brew install sox        # macOS
apt install sox         # Linux
choco install sox       # Windows

# For local TTS fallback on Linux
apt install espeak-ng   # Debian/Ubuntu
dnf install espeak-ng   # Fedora
```

## Configuration

Config is stored in `~/.talkback/`:

```
~/.talkback/
├── config.json    API keys and preferences
├── stats.json     Usage statistics
├── cache/         Cached audio files
├── locks/         Voice reservations
└── queue.json     Message queue
```

## Smart Features

### Project-Specific Phonetics

Add a `.talkback.json` file to any project for custom pronunciations:

```json
{
  "phonetics": {
    "myapp": "my app",
    "kubectl": "cube control",
    "nginx": "engine x"
  }
}
```

These override the built-in phonetics for that project directory.

### Built-in Phonetic Corrections

Technical terms are pronounced clearly:

| You type | Spoken as |
|----------|-----------|
| npm | "N P M" |
| kubectl | "kube control" |
| k8s | "kubernetes" |
| json | "jason" |
| sql | "sequel" |
| api | "A P I" |

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
talkback "Build failed with 3 errors"   # error beep + speech
talkback "Tests passed!"                 # success beep + speech
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
text → phonetics → strip code → detect sentiment → [cache check] → TTS API → sox play
                                                         ↓
                                                   [cache hit] → play cached audio
```

1. **Text Processing** — Phonetic fixes, code stripping, sentiment detection
2. **Caching** — Check for cached audio before API call
3. **Providers** — Multiple TTS backends (ElevenLabs, OpenAI, Azure, AWS, Google)
4. **Fallback** — Local TTS when API unavailable
5. **Queue** — Rapid messages are queued and played in order
6. **Locks** — File-based locks prevent audio overlap

## Files

```
src/
├── index.ts      CLI entry point (Commander-based)
├── api.ts        ElevenLabs TTS client
├── providers.ts  Multi-provider abstraction
├── player.ts     Sox audio playback + voice signatures
├── voices.ts     Voice configuration
├── text.ts       Phonetics, code stripping, sentiment
├── cache.ts      Audio caching
├── local-tts.ts  Local TTS fallback (say/espeak)
├── stats.ts      Usage tracking
├── locks.ts      Voice reservation
├── queue.ts      Message queue
├── setup.ts      Setup wizard
├── validation.ts JSON schema validation
└── git.ts        Git hooks management
```

## Security

### API Key Management

Your API keys are sensitive. Talkback provides two options:

**Option 1: Environment Variables (Recommended)**
```bash
export ELEVENLABS_API_KEY="your-key-here"
export OPENAI_API_KEY="your-key-here"
# etc.
```
This keeps your keys out of the filesystem and works well with secrets managers.

**Option 2: Config File**
The `setup` and `provider add` commands store keys in `~/.talkback/config.json` with restricted permissions (owner read/write only).

### Git Hooks

Git hooks installed by `talkback git install` sanitize commit messages and branch names to prevent shell injection.

### Data Files

All data files are validated on load. Corrupted files are reset to defaults rather than causing undefined behavior.

### Network Security

- All API calls use HTTPS
- Requests have a 30-second timeout
- Only whitelisted environment variables are passed to child processes

## License

MIT
