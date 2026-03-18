# Personal Assistant

A multi-platform personal assistant powered by the [GitHub Copilot SDK](https://github.com/github/copilot-sdk). Chat via Telegram now, expand to Viber/WhatsApp later.

## Features

- 🤖 **Copilot-powered** — uses the same agent engine behind GitHub Copilot CLI
- 💬 **Telegram bot** — talk to your assistant from anywhere
- 🔌 **Plugin system** — add new capabilities by dropping in a plugin folder
- 👥 **Multi-user** — each user gets their own isolated conversation
- 💾 **Persistent** — conversations and sessions survive restarts
- 🔍 **Web search** — built-in plugin for searching the web

## Prerequisites

1. **Node.js 20+** — [install](https://nodejs.org/)
2. **GitHub CLI** — [install](https://cli.github.com/) and authenticate:
   ```bash
   gh auth status      # Should show "Logged in"
   copilot --version   # Should show version
   ```
3. **Telegram Bot Token** — create one via [@BotFather](https://t.me/BotFather):
   - Open BotFather in Telegram
   - Send `/newbot` and follow the prompts
   - Copy the token

## Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in your values
cp .env.example .env
# Edit .env and add your TELEGRAM_BOT_TOKEN

# Set up personal context (optional but recommended)
cp prompts/CONTEXT.md.example prompts/CONTEXT.md
# Edit prompts/CONTEXT.md with your name, location, preferences
```

## Running

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## Usage

Open your bot in Telegram and start chatting! Type `/` to see the command menu.

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/reset` | Clear conversation and start fresh |
| `/settings` | View and change settings (model, streaming) |
| `/help` | Show available commands |

## Adding Plugins

Create a new folder under `src/plugins/` with an `index.ts` that exports a `Plugin` object:

```typescript
// src/plugins/my-plugin/index.ts
import { defineTool, type Tool } from "@github/copilot-sdk";
import { z } from "zod";
import type { Plugin } from "../types.js";

const myTool = defineTool("my_tool", {
  description: "What this tool does",
  parameters: z.object({
    input: z.string().describe("Input parameter"),
  }),
  handler: async (args) => {
    const { input } = args as { input: string };
    return `Result for: ${input}`;
  },
});

export const myPlugin: Plugin = {
  name: "my-plugin",
  description: "My custom plugin",
  tools: [myTool as Tool],
  systemPromptFragment: "You have access to my_tool. Use it when...",
};
```

Then register it in `src/index.ts`:

```typescript
import { myPlugin } from "./plugins/my-plugin/index.js";

// In main():
await plugins.register(myPlugin);
```

## Adding Messaging Platforms

Implement the `MessagingAdapter` interface in `src/adapters/`:

```typescript
interface MessagingAdapter {
  readonly platform: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: MessageHandler): void;
  sendMessage(chatId: string, text: string): Promise<void>;
  sendTypingAction(chatId: string): Promise<void>;
}
```

Then add it to the engine in `src/index.ts`:

```typescript
engine.addAdapter(new ViberAdapter(config.viberToken));
```

## Customizing the System Prompt

The assistant's behavior is defined by `.md` files in the `prompts/` directory. At startup, all `.md` files are loaded alphabetically and concatenated into the system prompt.

| File | Purpose | Committed? |
|------|---------|------------|
| `SOUL.md` | Personality, tone, behavior rules | ✅ Yes |
| `TOOLS.md` | Tool usage guidance and preferences | ✅ Yes |
| `CONTEXT.md` | Your personal context (name, location, preferences) | ❌ Gitignored |
| `CONTEXT.md.example` | Template for personal context | ✅ Yes |

### Getting started

```bash
# Copy the template and fill in your details
cp prompts/CONTEXT.md.example prompts/CONTEXT.md
# Edit prompts/CONTEXT.md with your personal info
```

### How it works

- Files are loaded in alphabetical order: `CONTEXT.md` → `SOUL.md` → `TOOLS.md`
- Plugin prompt fragments are appended after the loaded files
- If `prompts/` is missing or empty, a built-in default prompt is used
- Add new `.md` files to extend the prompt (e.g., `TOOLS-google.md` for Google Workspace)
- Changes take effect on restart (or after `/reset` which creates a new session)

## Architecture

```
Telegram ──┐
Viber    ──┤ Adapters → Engine → Session Manager → Copilot SDK → LLM
WhatsApp ──┘                  ↕                          ↕
                          User Manager              Plugin Tools
                              ↕
                        SQLite Database
```

## Project Structure

```
src/
├── index.ts              # Entry point
├── config.ts             # Environment config
├── adapters/
│   ├── types.ts          # MessagingAdapter interface
│   └── telegram.ts       # Telegram implementation
├── core/
│   ├── engine.ts         # Message routing orchestrator
│   ├── copilot-client.ts # Copilot SDK wrapper
│   ├── prompt-loader.ts  # Loads .md prompt files at startup
│   ├── session-manager.ts # Per-user session lifecycle
│   └── user-manager.ts   # Auth & user management
├── plugins/
│   ├── types.ts          # Plugin interface
│   ├── registry.ts       # Plugin loader
│   └── web-search/       # Built-in web search plugin
├── utils/
│   └── markdown-to-html.ts # Telegram HTML formatting
└── db/
    ├── types.ts          # Database interface
    ├── sqlite.ts         # SQLite implementation
    └── migrations/       # SQL migrations

prompts/                  # System prompt files (loaded alphabetically)
├── SOUL.md               # Personality, tone, behavior rules
├── TOOLS.md              # Tool usage guidance
├── CONTEXT.md.example    # Template for personal context
└── CONTEXT.md            # Your personal context (gitignored)
```

## License

MIT
