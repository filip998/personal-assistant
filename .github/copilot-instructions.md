# Copilot Instructions — personal-assistant

## Project Overview

Multi-platform personal assistant powered by the GitHub Copilot SDK (`@github/copilot-sdk`). Currently supports Telegram as a messaging platform via grammY. Uses SQLite (better-sqlite3) for persistence.

**Tech stack**: TypeScript, Node.js 20+, ESM (`"type": "module"`), Copilot SDK, grammY, better-sqlite3

## Architecture

```
src/
├── index.ts              # Entrypoint — bootstrap sequence
├── config.ts             # Env var loading + validation
├── core/
│   ├── copilot-client.ts # Thin wrapper around @github/copilot-sdk
│   ├── engine.ts         # Message router between adapters and Copilot
│   ├── session-manager.ts # Per-user Copilot session lifecycle (cache + DB)
│   └── user-manager.ts   # Authorization via allowlist
├── adapters/
│   ├── telegram.ts       # grammY-based Telegram adapter
│   └── types.ts          # MessagingAdapter interface
├── db/
│   ├── sqlite.ts         # SQLite implementation (WAL mode, migrations)
│   └── types.ts          # Database interface
├── plugins/
│   ├── registry.ts       # Plugin registration + tool/prompt aggregation
│   └── types.ts          # Plugin interface
└── utils/
    └── markdown-to-html.ts # LLM markdown → Telegram HTML converter
```

**Key pattern**: The `Engine` routes messages between platform `Adapters` and the `CopilotWrapper`. Each user gets their own Copilot session (managed by `SessionManager`). The `PluginRegistry` allows extending tools and system prompts without modifying core code.

## Commands

```bash
npm run dev        # Start with tsx watch (hot reload)
npm start          # Start with tsx
npm run build      # Compile TypeScript (tsc)
npm run typecheck  # Type-check without emitting (tsc --noEmit)
npm test           # Run tests (vitest run)
npm run test:watch # Run tests in watch mode (vitest)
```

**Note**: `npm run lint` (eslint) is configured but the `eslint.config.js` file is missing — it will fail. This is a known gap.

## Code Conventions

### Imports

- **ESM with `.js` extensions** on all relative imports (required by Node.js ESM resolution):
  ```typescript
  import { loadConfig } from "./config.js";
  import type { Database } from "../db/types.js";
  ```
- **Type-only imports** use `import type { ... }`
- **Named exports only** — no default exports anywhere in the codebase

### Error Handling

- Console log prefixes for context: `[sessions]`, `[copilot]`, `[plugins]`, `[mcp]`
- Standard `Error` with descriptive messages (no custom error classes)
- Silent catch for non-critical paths (typing indicators, shutdown cleanup):
  ```typescript
  adapter.sendTypingAction(msg.chatId).catch(() => {});
  ```
- Fatal errors in `main()` caught at root level with `process.exit(1)`

### TypeScript

- `strict: true` in tsconfig
- Target: ES2022, Module: Node16
- `*.test.ts` files excluded from build output

## Testing

- **Runner**: Vitest (TypeScript/ESM native, zero config)
- **Location**: Co-located — `*.test.ts` next to source files (e.g., `src/utils/markdown-to-html.test.ts`)
- **Pattern**: `describe` / `it` / `expect` (Jest-compatible API)
- **Mocking**: Use `vi.mock()` and `vi.fn()` from Vitest
- **Config module tests**: Must use `vi.resetModules()` + dynamic `import()` because `dotenv.config()` runs at module load time

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Telegram bot token from @BotFather |
| `ALLOWED_USER_IDS` | No | (allow all) | Comma-separated Telegram user IDs |
| `COPILOT_MODEL` | No | `claude-sonnet-4` | LLM model for Copilot SDK |
| `DB_PATH` | No | `./data/assistant.db` | SQLite database file path |
| `LOG_LEVEL` | No | `info` | debug \| info \| warn \| error |

GitHub token is auto-discovered from `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`, or `gh auth token` CLI fallback.

## Database

- **Engine**: SQLite via better-sqlite3 (WAL mode, foreign keys enabled)
- **Migrations**: SQL files in a migrations directory, applied by `db.migrate()`
- **Testing**: Use `:memory:` SQLite for integration tests (no file I/O)

## Adding New Features

- **New adapter**: Implement `MessagingAdapter` interface from `src/adapters/types.ts`, register in `index.ts`
- **New plugin**: Implement `Plugin` interface from `src/plugins/types.ts`, register via `PluginRegistry`
- **New utility**: Add to `src/utils/`, export as named function, write co-located tests
