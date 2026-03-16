import type { CopilotSession } from "@github/copilot-sdk";
import type { Database } from "../db/types.js";
import type { CopilotWrapper } from "./copilot-client.js";

/**
 * Manages per-user Copilot sessions.
 * Creates new sessions on first interaction, resumes existing ones.
 */
export class SessionManager {
  private activeSessions: Map<string, CopilotSession> = new Map();

  constructor(
    private copilot: CopilotWrapper,
    private db: Database
  ) {}

  /**
   * Get or create a Copilot session for a user.
   * Tries to resume from DB, falls back to creating a new one.
   */
  async getSession(userId: string): Promise<CopilotSession> {
    // Check in-memory cache first
    const cached = this.activeSessions.get(userId);
    if (cached) {
      this.db.touchSession(userId);
      return cached;
    }

    // Try to resume from DB
    const record = this.db.getSession(userId);
    if (record) {
      try {
        const session = await this.copilot.resumeSession(
          record.copilotSessionId
        );
        this.activeSessions.set(userId, session);
        this.db.touchSession(userId);
        return session;
      } catch (err) {
        console.log(
          `[sessions] Could not resume session for user ${userId}, creating new one`
        );
      }
    }

    // Create a new session
    const session = await this.copilot.createSession();
    this.activeSessions.set(userId, session);
    this.db.upsertSession(userId, session.sessionId, "default");
    return session;
  }

  /** Remove a user's session from cache AND DB (e.g., on /reset command) */
  async resetSession(userId: string): Promise<void> {
    const session = this.activeSessions.get(userId);
    if (session) {
      await session.disconnect();
      this.activeSessions.delete(userId);
    }
    this.db.deleteSession(userId);
  }

  /** Disconnect all active sessions */
  async disconnectAll(): Promise<void> {
    for (const [userId, session] of this.activeSessions) {
      try {
        await session.disconnect();
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.activeSessions.clear();
  }
}
