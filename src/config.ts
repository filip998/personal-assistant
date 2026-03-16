import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

loadEnv();

export interface Config {
  telegramBotToken: string;
  allowedUserIds: string[];
  dbPath: string;
  logLevel: "debug" | "info" | "warn" | "error";
  model: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  const dbPath = resolve(process.env.DB_PATH || "./data/assistant.db");

  return {
    telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    allowedUserIds: (process.env.ALLOWED_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    dbPath,
    logLevel: (process.env.LOG_LEVEL as Config["logLevel"]) || "info",
    model: process.env.COPILOT_MODEL || "claude-sonnet-4",
  };
}
