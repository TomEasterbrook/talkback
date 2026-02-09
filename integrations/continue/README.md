# Talkback + Continue.dev Integration

Add voice notifications to Continue.dev.

## Setup

### Option 1: Custom Slash Commands

Add to your `~/.continue/config.json`:

```json
{
  "customCommands": [
    {
      "name": "say",
      "description": "Speak a message aloud",
      "prompt": "Run this command and report the result: npx talkback-cli \"{{{ input }}}\""
    },
    {
      "name": "done",
      "description": "Announce task completion",
      "prompt": "Run: npx talkback-cli \"Task complete\""
    }
  ]
}
```

### Option 2: In Your Prompts

Tell Continue to use talkback in your system prompt or instructions:

```
When you complete a task, run: npx talkback-cli "Done: [brief description]"
When you encounter an error, run: npx talkback-cli "Error: [brief description]" --priority critical
```

## Usage

In Continue.dev chat:
- `/say Hello world` - Speaks "Hello world"
- `/done` - Announces task completion

## Tips

- Use `--priority critical` for important notifications
- Use `--summarize` for long output
- Set `TALKBACK_VOICE` environment variable for consistent voice
