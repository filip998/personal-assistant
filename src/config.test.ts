import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dotenv before importing config — loadEnv() runs at import time
vi.mock("dotenv", () => ({
  config: vi.fn(),
}));

describe("loadConfig", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    // Set the minimum required env var
    process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
  });

  async function loadConfigFresh() {
    const mod = await import("./config.js");
    return mod.loadConfig();
  }

  describe("required variables", () => {
    it("throws if TELEGRAM_BOT_TOKEN is missing", async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      await expect(loadConfigFresh()).rejects.toThrow(
        "Missing required environment variable: TELEGRAM_BOT_TOKEN"
      );
    });

    it("reads TELEGRAM_BOT_TOKEN", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "my-secret-token";
      const config = await loadConfigFresh();
      expect(config.telegramBotToken).toBe("my-secret-token");
    });
  });

  describe("defaults", () => {
    it("defaults logLevel to 'info'", async () => {
      const config = await loadConfigFresh();
      expect(config.logLevel).toBe("info");
    });

    it("defaults model to 'claude-sonnet-4'", async () => {
      const config = await loadConfigFresh();
      expect(config.model).toBe("claude-sonnet-4");
    });

    it("defaults dbPath to ./data/assistant.db (resolved)", async () => {
      const config = await loadConfigFresh();
      expect(config.dbPath).toContain("assistant.db");
      expect(config.dbPath).toContain("data");
    });

    it("defaults allowedUserIds to empty array", async () => {
      const config = await loadConfigFresh();
      expect(config.allowedUserIds).toEqual([]);
    });
  });

  describe("ALLOWED_USER_IDS parsing", () => {
    it("splits comma-separated IDs", async () => {
      process.env.ALLOWED_USER_IDS = "111,222,333";
      const config = await loadConfigFresh();
      expect(config.allowedUserIds).toEqual(["111", "222", "333"]);
    });

    it("trims whitespace around IDs", async () => {
      process.env.ALLOWED_USER_IDS = " 111 , 222 , 333 ";
      const config = await loadConfigFresh();
      expect(config.allowedUserIds).toEqual(["111", "222", "333"]);
    });

    it("filters out empty entries", async () => {
      process.env.ALLOWED_USER_IDS = "111,,222,";
      const config = await loadConfigFresh();
      expect(config.allowedUserIds).toEqual(["111", "222"]);
    });
  });

  describe("optional overrides", () => {
    it("accepts LOG_LEVEL override", async () => {
      process.env.LOG_LEVEL = "debug";
      const config = await loadConfigFresh();
      expect(config.logLevel).toBe("debug");
    });

    it("accepts COPILOT_MODEL override", async () => {
      process.env.COPILOT_MODEL = "gpt-4";
      const config = await loadConfigFresh();
      expect(config.model).toBe("gpt-4");
    });

    it("accepts DB_PATH override", async () => {
      process.env.DB_PATH = "/custom/path/db.sqlite";
      const config = await loadConfigFresh();
      expect(config.dbPath).toBe("/custom/path/db.sqlite");
    });
  });
});
