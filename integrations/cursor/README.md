# Talkback + Cursor Integration

Add voice notifications to Cursor IDE.

## Setup

1. Copy `.cursorrules` to your project root:
   ```bash
   cp integrations/cursor/.cursorrules /path/to/your/project/
   ```

2. Or add to your global Cursor rules

## How It Works

The `.cursorrules` file instructs Cursor's AI to use talkback for voice feedback. The AI will automatically:

- Announce when tasks are complete
- Alert you to errors (with priority)
- Provide audio updates during long operations

## Customization

Edit `.cursorrules` to adjust when and how notifications are used:

```
# More aggressive notifications
Always announce when you start and finish a task.

# Quieter mode
Only use voice for errors and task completion.
```

## Tips

- Cursor reads `.cursorrules` from your project root
- Rules are additive - you can have project-specific and global rules
- Use `--priority critical` for notifications that should bypass quiet hours
