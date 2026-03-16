import BetterSqlite3 from "better-sqlite3";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Database, User, SessionRecord, MessageRecord } from "./types.js";

export class SQLiteDatabase implements Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  migrate(): void {
    const migrationsDir = resolve(
      import.meta.dirname,
      "migrations"
    );
    const migration = readFileSync(
      resolve(migrationsDir, "001-init.sql"),
      "utf-8"
    );
    this.db.exec(migration);
    console.log("[db] Migrations applied");
  }

  close(): void {
    this.db.close();
  }

  upsertUser(
    platform: string,
    platformUserId: string,
    displayName: string
  ): User {
    const existing = this.getUser(platform, platformUserId);
    if (existing) {
      return existing;
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO users (id, platform, platform_user_id, display_name)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, platform, platformUserId, displayName);

    return this.getUser(platform, platformUserId)!;
  }

  getUser(platform: string, platformUserId: string): User | undefined {
    const row = this.db
      .prepare(
        `SELECT id, platform, platform_user_id as platformUserId,
                display_name as displayName, created_at as createdAt
         FROM users WHERE platform = ? AND platform_user_id = ?`
      )
      .get(platform, platformUserId) as User | undefined;
    return row;
  }

  getSession(userId: string): SessionRecord | undefined {
    return this.db
      .prepare(
        `SELECT user_id as userId, copilot_session_id as copilotSessionId,
                model, created_at as createdAt, last_active_at as lastActiveAt
         FROM sessions WHERE user_id = ?`
      )
      .get(userId) as SessionRecord | undefined;
  }

  upsertSession(
    userId: string,
    copilotSessionId: string,
    model: string
  ): void {
    this.db
      .prepare(
        `INSERT INTO sessions (user_id, copilot_session_id, model)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           copilot_session_id = excluded.copilot_session_id,
           model = excluded.model,
           last_active_at = datetime('now')`
      )
      .run(userId, copilotSessionId, model);
  }

  touchSession(userId: string): void {
    this.db
      .prepare(
        `UPDATE sessions SET last_active_at = datetime('now') WHERE user_id = ?`
      )
      .run(userId);
  }

  deleteSession(userId: string): void {
    this.db
      .prepare(`DELETE FROM sessions WHERE user_id = ?`)
      .run(userId);
  }

  logMessage(
    userId: string,
    role: "user" | "assistant",
    content: string,
    platform: string
  ): void {
    this.db
      .prepare(
        `INSERT INTO messages (user_id, role, content, platform) VALUES (?, ?, ?, ?)`
      )
      .run(userId, role, content, platform);
  }

  getRecentMessages(userId: string, limit = 50): MessageRecord[] {
    return this.db
      .prepare(
        `SELECT id, user_id as userId, role, content, platform,
                created_at as createdAt
         FROM messages WHERE user_id = ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(userId, limit) as MessageRecord[];
  }

  getUserPref(userId: string, key: string): string | undefined {
    const row = this.db
      .prepare(`SELECT value FROM user_preferences WHERE user_id = ? AND key = ?`)
      .get(userId, key) as { value: string } | undefined;
    return row?.value;
  }

  setUserPref(userId: string, key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO user_preferences (user_id, key, value) VALUES (?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
      )
      .run(userId, key, value);
  }

  getAllPrefs(userId: string): Record<string, string> {
    const rows = this.db
      .prepare(`SELECT key, value FROM user_preferences WHERE user_id = ?`)
      .all(userId) as { key: string; value: string }[];
    const prefs: Record<string, string> = {};
    for (const row of rows) {
      prefs[row.key] = row.value;
    }
    return prefs;
  }
}
