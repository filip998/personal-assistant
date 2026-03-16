import type { MessagingAdapter, IncomingMessage } from "../adapters/types.js";
import type { Database } from "../db/types.js";
import type { SessionManager } from "./session-manager.js";
import type { UserManager } from "./user-manager.js";

const TOOL_ICONS: Record<string, string> = {
  web_search: "🔍",
  web_fetch: "📄",
  bash: "💻",
  grep: "🔎",
  view: "👁️",
  edit: "✏️",
  create: "📝",
  task: "🤖",
  default: "🔧",
};

const SETTINGS_DEFAULTS: Record<string, string> = {
  streaming: "on",
};

/**
 * Core engine — routes messages between adapters and Copilot SDK sessions.
 */
export class Engine {
  private adapters: MessagingAdapter[] = [];

  constructor(
    private sessionManager: SessionManager,
    private userManager: UserManager,
    private db: Database
  ) {}

  /** Register a messaging adapter */
  addAdapter(adapter: MessagingAdapter): void {
    adapter.onMessage((msg) => this.handleMessage(adapter, msg));
    this.adapters.push(adapter);
  }

  /** Start all registered adapters */
  async start(): Promise<void> {
    for (const adapter of this.adapters) {
      await adapter.start();
    }
    console.log(
      `[engine] Started with ${this.adapters.length} adapter(s): ${this.adapters.map((a) => a.platform).join(", ")}`
    );
  }

  /** Stop all adapters and sessions */
  async stop(): Promise<void> {
    await this.sessionManager.disconnectAll();
    for (const adapter of this.adapters) {
      await adapter.stop();
    }
  }

  private getSetting(userId: string, key: string): string {
    return this.db.getUserPref(userId, key) ?? SETTINGS_DEFAULTS[key] ?? "off";
  }

  private async handleMessage(
    adapter: MessagingAdapter,
    msg: IncomingMessage
  ): Promise<void> {
    const userId = this.userManager.authorize(
      msg.platform,
      msg.userId,
      msg.displayName
    );
    if (!userId) {
      await adapter.sendMessage(
        msg.chatId,
        "⛔ Sorry, you are not authorized to use this bot."
      );
      return;
    }

    if (msg.text.startsWith("/")) {
      await this.handleCommand(adapter, msg, userId);
      return;
    }

    this.db.logMessage(userId, "user", msg.text, msg.platform);

    const streamingEnabled = this.getSetting(userId, "streaming") === "on";

    // Send initial status message if streaming is on, otherwise just typing indicator
    let statusMessageId: string | undefined;
    const statusLines: string[] = [];

    if (streamingEnabled) {
      statusMessageId = await adapter.sendMessage(msg.chatId, "⏳ Thinking...");
      statusLines.push("⏳ Thinking...");
    } else {
      await adapter.sendTypingAction(msg.chatId);
    }

    const typingInterval = setInterval(
      () => adapter.sendTypingAction(msg.chatId).catch(() => {}),
      4000
    );

    // Throttle status message edits to 1 per second
    let lastEditTime = 0;
    let pendingEdit: ReturnType<typeof setTimeout> | null = null;

    const updateStatus = (line: string) => {
      if (!streamingEnabled || !statusMessageId) return;

      statusLines.push(line);
      const text = statusLines.join("\n");

      const now = Date.now();
      const timeSinceLastEdit = now - lastEditTime;

      if (timeSinceLastEdit >= 1000) {
        lastEditTime = now;
        adapter.editMessage(msg.chatId, statusMessageId, text).catch(() => {});
      } else {
        // Schedule an edit for later
        if (pendingEdit) clearTimeout(pendingEdit);
        pendingEdit = setTimeout(() => {
          lastEditTime = Date.now();
          adapter
            .editMessage(msg.chatId, statusMessageId!, text)
            .catch(() => {});
        }, 1000 - timeSinceLastEdit);
      }
    };

    try {
      const session = await this.sessionManager.getSession(userId);

      session.on((event) => {
        const t = event.type as string;
        const data = event.data as any;

        if (t === "tool.execution_start") {
          const toolName = data.toolName ?? "unknown";
          const icon = TOOL_ICONS[toolName] ?? TOOL_ICONS.default;
          console.log(`[tool] ▶ ${toolName}`);
          updateStatus(`${icon} Using ${toolName}...`);
        } else if (t === "tool.execution_complete") {
          console.log(`[tool] ◀ ${data.toolName ?? "unknown"} done`);
        } else if (t === "permission.requested") {
          updateStatus("🔐 Approving permission...");
        } else if (!t.includes("delta")) {
          console.log(`[event] ${t}`);
        }
      });

      const response = await session.sendAndWait(
        { prompt: msg.text },
        5 * 60 * 1000
      );

      // Clean up pending edit
      if (pendingEdit) clearTimeout(pendingEdit);

      // Delete the status message before sending the final response
      if (statusMessageId) {
        await adapter.deleteMessage(msg.chatId, statusMessageId);
      }

      const content = response?.data?.content;
      if (content) {
        this.db.logMessage(userId, "assistant", content, msg.platform);
        await adapter.sendMessage(msg.chatId, content);
      } else {
        await adapter.sendMessage(
          msg.chatId,
          "🤔 I didn't get a response. Try again?"
        );
      }
    } catch (err) {
      if (pendingEdit) clearTimeout(pendingEdit);
      if (statusMessageId) {
        await adapter.deleteMessage(msg.chatId, statusMessageId);
      }
      console.error("[engine] Error processing message:", err);
      await adapter.sendMessage(
        msg.chatId,
        "❌ Something went wrong. Please try again."
      );
    } finally {
      clearInterval(typingInterval);
    }
  }

  private async handleCommand(
    adapter: MessagingAdapter,
    msg: IncomingMessage,
    userId: string
  ): Promise<void> {
    const parts = msg.text.split(/\s+/);
    const command = parts[0]!.toLowerCase();

    switch (command) {
      case "/start":
        await adapter.sendMessage(
          msg.chatId,
          "👋 Hey! I'm your personal assistant powered by Copilot.\n\nJust send me a message and I'll help you out.\n\nCommands:\n/reset — Start a new conversation\n/settings — View and change settings\n/help — Show this help message"
        );
        break;

      case "/reset":
        await this.sessionManager.resetSession(userId);
        await adapter.sendMessage(
          msg.chatId,
          "🔄 Conversation reset. Starting fresh!"
        );
        break;

      case "/settings":
        await this.handleSettings(adapter, msg, userId, parts.slice(1));
        break;

      case "/help":
        await adapter.sendMessage(
          msg.chatId,
          "🤖 Personal Assistant\n\nI can help you with:\n- General questions and conversations\n- Web search\n- Planning and research\n- Tips and tricks\n\nCommands:\n/reset — Start a new conversation\n/settings — View and change settings\n/help — Show this help"
        );
        break;

      default:
        await adapter.sendMessage(
          msg.chatId,
          `Unknown command: ${command}. Try /help`
        );
    }
  }

  private async handleSettings(
    adapter: MessagingAdapter,
    msg: IncomingMessage,
    userId: string,
    args: string[]
  ): Promise<void> {
    // /settings — list all
    if (args.length === 0) {
      const allPrefs = this.db.getAllPrefs(userId);
      const lines = Object.keys(SETTINGS_DEFAULTS).map((key) => {
        const value = allPrefs[key] ?? SETTINGS_DEFAULTS[key] ?? "off";
        return `  ${key}: ${value}`;
      });
      await adapter.sendMessage(
        msg.chatId,
        `⚙️ Settings:\n${lines.join("\n")}\n\nUsage: /settings <name> [on|off]`
      );
      return;
    }

    const settingName = args[0]!.toLowerCase();
    const settingValue = args[1]?.toLowerCase();

    // Check if it's a valid setting
    if (!(settingName in SETTINGS_DEFAULTS)) {
      await adapter.sendMessage(
        msg.chatId,
        `Unknown setting: ${settingName}\n\nAvailable: ${Object.keys(SETTINGS_DEFAULTS).join(", ")}`
      );
      return;
    }

    // /settings <name> — show current value
    if (!settingValue) {
      const current = this.getSetting(userId, settingName);
      await adapter.sendMessage(
        msg.chatId,
        `⚙️ ${settingName}: ${current}`
      );
      return;
    }

    // /settings <name> on|off
    if (settingValue !== "on" && settingValue !== "off") {
      await adapter.sendMessage(
        msg.chatId,
        `Invalid value: ${settingValue}. Use "on" or "off".`
      );
      return;
    }

    this.db.setUserPref(userId, settingName, settingValue);
    await adapter.sendMessage(
      msg.chatId,
      `✅ ${settingName}: ${settingValue}`
    );
  }
}
