export interface Database {
  /** Run migrations to set up / update the schema */
  migrate(): void;

  /** Close the database connection */
  close(): void;

  // --- Users ---
  upsertUser(platform: string, platformUserId: string, displayName: string): User;
  getUser(platform: string, platformUserId: string): User | undefined;

  // --- Sessions ---
  getSession(userId: string): SessionRecord | undefined;
  upsertSession(userId: string, copilotSessionId: string, model: string): void;
  deleteSession(userId: string): void;
  touchSession(userId: string): void;

  // --- Messages ---
  logMessage(userId: string, role: "user" | "assistant", content: string, platform: string): void;
  getRecentMessages(userId: string, limit?: number): MessageRecord[];

  // --- User Preferences ---
  getUserPref(userId: string, key: string): string | undefined;
  setUserPref(userId: string, key: string, value: string): void;
  getAllPrefs(userId: string): Record<string, string>;
}

export interface User {
  id: string;
  platform: string;
  platformUserId: string;
  displayName: string;
  createdAt: string;
}

export interface SessionRecord {
  userId: string;
  copilotSessionId: string;
  model: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface MessageRecord {
  id: number;
  userId: string;
  role: "user" | "assistant";
  content: string;
  platform: string;
  createdAt: string;
}
