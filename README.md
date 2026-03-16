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
```

## Running

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## Usage

Open your bot in Telegram and start chatting! Commands:

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/reset` | Clear conversation and start fresh |
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
│   ├── session-manager.ts # Per-user session lifecycle
│   └── user-manager.ts   # Auth & user management
├── plugins/
│   ├── types.ts          # Plugin interface
│   ├── registry.ts       # Plugin loader
│   └── web-search/       # Built-in web search plugin
└── db/
    ├── types.ts          # Database interface
    ├── sqlite.ts         # SQLite implementation
    └── migrations/       # SQL migrations
```

## License

MIT
