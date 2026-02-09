# Talkback

**Voice for agentic coders** — A CLI tool that speaks text aloud using multiple TTS providers.

Designed for AI coding assistants running in terminals. When you're running multiple coding sessions, audio feedback lets you know what's happening without switching windows.

## Install

```bash
# Via npx (no install needed)
npx talkback-cli "Hello world"

# Or install globally
npm install -g talkback-cli
talkback "Hello world"

# Or via Homebrew
brew tap talkback/talkback
brew install talkback
```

## Quick Start

```bash
# Configure your API key
talkback setup

# Speak!
talkback "Build complete"

# Quick beeps (no API cost)
talkback --beep success
talkback --beep error
```

## AI Agent Integration

Talkback works with all major AI coding assistants:

| Agent | Integration | Setup |
|-------|-------------|-------|
| **Claude Code** | MCP Server (native) | [Setup →](#claude-code-mcp) |
| **Cursor** | .cursorrules | [Setup →](#cursor) |
| **Continue.dev** | Slash commands | [Setup →](#continuedev) |
| **Aider** | Config file | [Setup →](#aider) |
| **Any agent** | CLI via npx | `npx talkback-cli "msg"` |

### Claude Code (MCP)

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "talkback": {
      "command": "npx",
      "args": ["talkback-cli", "mcp"]
    }
  }
}
```

Claude Code gets native tools: `speak`, `beep`, `reserve_voice`, `release_voice`, `voice_status`, `list_voices`.

### Cursor

Copy `.cursorrules` to your project:

```bash
curl -o .cursorrules https://raw.githubusercontent.com/talkback/talkback/main/integrations/cursor/.cursorrules
```

### Continue.dev

Add custom commands to `~/.continue/config.json`:

```json
{
  "customCommands": [{
    "name": "say",
    "description": "Speak a message",
    "prompt": "Run: npx talkback-cli \"{{{ input }}}\""
  }]
}
```

### Aider

Copy config to your project or home:

```bash
curl -o .aider.conf.yml https://raw.githubusercontent.com/talkback/talkback/main/integrations/aider/.aider.conf.yml
```

## Features

### AI Summarization

Summarize long output before speaking — saves up to 90% on TTS costs:

```bash
talkback "$(cat build.log)" --summarize
```

Uses OpenAI/Anthropic/Groq to condense verbose output into a brief spoken summary.

### Streaming TTS

Start playback before generation completes — lower perceived latency:

```bash
talkback "This is a longer message that streams" --stream
```

### Priority Queue

Urgent messages jump ahead; critical bypasses quiet hours:

```bash
talkback "Tests failed!" --priority critical
talkback "Build starting" --priority low
```

Levels: `critical`, `high`, `normal`, `low`

### Quiet Hours

Silence notifications during meetings:

```bash
talkback quiet 9am-10am,2pm-3pm    # Set quiet hours
talkback quiet off                  # Disable
talkback quiet                      # Show status
```

Critical priority messages still play during quiet hours.

### Sound Themes

Customize notification sounds:

```bash
talkback theme              # List themes
talkback theme retro        # 8-bit bleeps
talkback theme scifi        # Futuristic tones
talkback theme minimal      # Subtle sounds
talkback theme gentle       # Soft, calm
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

Talkback always returns immediately (~50ms) while audio plays in the background.

## TTS Providers

| Provider | Description |
|----------|-------------|
| **elevenlabs** | High quality voices (default) |
| **openai** | Simple pricing, good quality |
| **azure** | Enterprise, many languages |
| **aws** | AWS Polly, cost-effective |
| **google** | Google Cloud TTS, multilingual |

```bash
talkback provider list          # List available
talkback provider add openai    # Configure
talkback provider set openai    # Switch
```

### Local TTS Fallback

When API is unavailable or over budget:

- **macOS**: Built-in `say` command
- **Linux**: `espeak` or `espeak-ng`

```bash
talkback --local "This uses system TTS"
```

## Voices

Five voices, available in US or British accents:

| Name | Description | Signature |
|------|-------------|-----------|
| alex | Clear, neutral (default) | C note |
| sam | Warm female | E note |
| jordan | Energetic male | G note |
| casey | Calm female | D note |
| morgan | Deep male | A note |

Each voice has a unique musical signature tone for identification.

```bash
talkback voices                    # List voices
talkback setup                     # Change accent
talkback --no-signature "msg"      # Skip tone
```

## Multi-Session Support

Reserve different voices for multiple AI sessions:

```bash
export TALKBACK_VOICE=$(talkback reserve)   # At session start
talkback "Working on frontend"               # Uses reserved voice
talkback release                             # At session end
talkback status                              # Check reservations
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
| `quiet` | Set quiet hours |
| `theme` | Set sound theme |

## Options

| Option | Description |
|--------|-------------|
| `-v, --voice <name>` | Voice: alex, sam, jordan, casey, morgan |
| `--speed <speed>` | fast, normal, slow |
| `-m, --max-length <n>` | Truncate messages (default: 500) |
| `-b, --beep <type>` | Quick sound: success, error |
| `-l, --local` | Use local TTS instead of API |
| `-s, --summarize` | AI-summarize long messages |
| `-p, --priority <level>` | critical, high, normal, low |
| `--stream` | Stream audio for lower latency |
| `--no-signature` | Skip the voice signature tone |

## Cost Control

```bash
talkback stats                    # View usage
talkback stats --budget 10000     # Set daily limit (chars)
talkback stats --budget none      # Remove limit
```

- Messages auto-truncate at 500 chars (configurable with `-m`)
- Caching reduces repeat API calls
- `--summarize` reduces long messages by up to 90%
- Budget warnings at 75%, 90%, 95%

## Audio Caching

```bash
talkback cache          # View stats
talkback cache clear    # Clear cache
```

- Location: `~/.talkback/cache/`
- Max size: 50 MB (auto-cleanup)
- Max age: 30 days

## Git Integration

```bash
talkback git            # Check status
talkback git install    # Install hooks
talkback git uninstall  # Remove hooks
```

Announces commits, branch switches, pushes, and merges.

## Smart Features

### Project-Specific Phonetics

Add `.talkback.json` to any project:

```json
{
  "phonetics": {
    "myapp": "my app",
    "kubectl": "cube control"
  }
}
```

### Built-in Phonetics

| You type | Spoken as |
|----------|-----------|
| npm | "N P M" |
| kubectl | "kube control" |
| k8s | "kubernetes" |
| json | "jason" |
| api | "A P I" |

### Auto-Detection

Errors and successes are detected and prefixed with appropriate beeps.

## Requirements

- Node.js 18+
- [sox](http://sox.sourceforge.net/) for audio playback
- API key (or use local TTS)

```bash
# Install sox
brew install sox        # macOS
apt install sox         # Linux
choco install sox       # Windows

# For local TTS on Linux
apt install espeak-ng
```

## Configuration

```
~/.talkback/
├── config.json    # API keys and preferences
├── stats.json     # Usage statistics
├── quiet.json     # Quiet hours config
├── theme.json     # Sound theme
├── cache/         # Cached audio files
├── locks/         # Voice reservations
└── queue.json     # Message queue
```

## Project Structure

```
src/
├── index.ts        # CLI entry point
├── api.ts          # ElevenLabs TTS client
├── providers.ts    # Multi-provider abstraction
├── player.ts       # Audio playback + themes
├── voices.ts       # Voice configuration
├── text.ts         # Phonetics, sentiment detection
├── cache.ts        # Audio caching
├── local-tts.ts    # Local TTS fallback
├── stats.ts        # Usage tracking
├── locks.ts        # Voice reservation
├── queue.ts        # Priority message queue
├── setup.ts        # Setup wizard
├── quiet.ts        # Quiet hours
├── themes.ts       # Sound themes
├── summarize.ts    # AI summarization
├── mcp-server.ts   # MCP server for AI agents
└── git.ts          # Git hooks

integrations/
├── claude-code/    # MCP config
├── cursor/         # .cursorrules
├── continue/       # Slash commands
└── aider/          # Config file
```

## License

MIT
