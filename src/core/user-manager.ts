import type { Database } from "../db/types.js";
import type { Config } from "../config.js";

export class UserManager {
  constructor(
    private db: Database,
    private config: Config
  ) {}

  /**
   * Ensure the user exists in the DB and check if they're allowed.
   * Returns the internal user ID, or null if access is denied.
   */
  authorize(
    platform: string,
    platformUserId: string,
    displayName: string
  ): string | null {
    // Check allowlist (empty = allow everyone)
    if (
      this.config.allowedUserIds.length > 0 &&
      !this.config.allowedUserIds.includes(platformUserId)
    ) {
      console.log(
        `[users] Access denied for ${platform}:${platformUserId} (${displayName})`
      );
      return null;
    }

    const user = this.db.upsertUser(platform, platformUserId, displayName);
    return user.id;
  }
}
