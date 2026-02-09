# Talkback + Claude Code Integration

Native voice notifications for Claude Code via MCP.

## Setup (MCP - Recommended)

Add to your Claude Code MCP config (`~/.claude/claude_desktop_config.json`):

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

Or if installed globally:

```json
{
  "mcpServers": {
    "talkback": {
      "command": "talkback-mcp"
    }
  }
}
```

## Available MCP Tools

Once configured, Claude Code can use these tools:

| Tool | Description |
|------|-------------|
| `speak` | Speak a message with optional voice, speed, priority |
| `beep` | Play success/error sound effect |
| `reserve_voice` | Reserve a unique voice for the session |
| `release_voice` | Release a reserved voice |
| `voice_status` | Check which voices are available |
| `list_voices` | List all available voices |

## Alternative: Hooks

If you prefer hooks over MCP, add to your hooks config:

```json
{
  "hooks": {
    "post-tool-call": [
      {
        "command": "npx talkback-cli \"Tool completed: $TOOL_NAME\""
      }
    ]
  }
}
```

## Usage

With MCP configured, Claude Code will automatically have access to voice. You can:

- Ask: "Announce when you're done with each file"
- Ask: "Use voice to tell me about errors"
- The AI will use `speak` and `beep` tools naturally

## Tips

- MCP gives Claude native tool access (no shell escaping issues)
- Use `reserve_voice` at session start for multi-agent setups
- Priority "critical" bypasses quiet hours
