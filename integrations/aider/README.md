# Talkback + Aider Integration

Add voice notifications to Aider.

## Setup

### Option 1: Project Config

Copy `.aider.conf.yml` to your project root:

```bash
cp integrations/aider/.aider.conf.yml /path/to/your/project/
```

### Option 2: Global Config

Copy to your home directory:

```bash
cp integrations/aider/.aider.conf.yml ~/.aider.conf.yml
```

### Option 3: Command Line

Add the system prompt directly:

```bash
aider --extra-system-prompt "Use npx talkback-cli to announce completions and errors"
```

## How It Works

The config adds instructions to Aider's system prompt, teaching it to use talkback's `/run` command for voice feedback.

## Usage Examples

In Aider chat, the AI will automatically use voice, or you can ask:

```
> Fix the bug in auth.js and announce when done
> Run the tests and tell me the results out loud
```

## Shell Wrapper (Optional)

For automatic announcements, create a wrapper script:

```bash
#!/bin/bash
# ~/bin/aider-voice

aider "$@"
exit_code=$?

if [ $exit_code -eq 0 ]; then
  npx talkback-cli "Aider session complete"
else
  npx talkback-cli "Aider exited with errors" --priority high
fi
```

## Tips

- Aider uses `/run` to execute shell commands
- The AI can chain commands: `/run npm test && npx talkback-cli "Tests passed"`
- Set `TALKBACK_VOICE` for consistent voice across sessions
