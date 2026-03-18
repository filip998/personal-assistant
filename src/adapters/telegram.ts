import { Bot } from "grammy";
import type { MessagingAdapter, MessageHandler, IncomingMessage } from "./types.js";
import { markdownToTelegramHtml } from "../utils/markdown-to-html.js";

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export class TelegramAdapter implements MessagingAdapter {
  readonly platform = "telegram";
  private bot: Bot;
  private handlers: MessageHandler[] = [];

  constructor(token: string) {
    this.bot = new Bot(token);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.bot.on("message:text", async (ctx) => {
      const msg: IncomingMessage = {
        chatId: String(ctx.chat.id),
        userId: String(ctx.from.id),
        displayName:
          ctx.from.first_name +
          (ctx.from.last_name ? ` ${ctx.from.last_name}` : ""),
        text: ctx.message.text,
        platform: this.platform,
      };

      for (const handler of this.handlers) {
        await handler(msg);
      }
    });
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async start(): Promise<void> {
    console.log("[telegram] Starting bot with long polling...");
    // Don't await — start() blocks forever in long-polling mode
    this.bot.start({
      onStart: () => console.log("[telegram] Bot is running"),
    });
  }

  async stop(): Promise<void> {
    console.log("[telegram] Stopping bot...");
    await this.bot.stop();
  }

  async sendMessage(chatId: string, text: string): Promise<string> {
    const html = markdownToTelegramHtml(text);
    const chunks = splitMessage(html, TELEGRAM_MAX_MESSAGE_LENGTH);
    let lastMessageId = "";
    for (const chunk of chunks) {
      try {
        const result = await this.bot.api.sendMessage(Number(chatId), chunk, {
          parse_mode: "HTML",
        });
        lastMessageId = String(result.message_id);
      } catch {
        // HTML parse failed — send original text as plain text
        const plainChunks = splitMessage(text, TELEGRAM_MAX_MESSAGE_LENGTH);
        for (const plain of plainChunks) {
          const result = await this.bot.api.sendMessage(Number(chatId), plain);
          lastMessageId = String(result.message_id);
        }
        break;
      }
    }
    return lastMessageId;
  }

  async editMessage(
    chatId: string,
    messageId: string,
    text: string
  ): Promise<void> {
    const truncated = text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH);
    try {
      await this.bot.api.editMessageText(
        Number(chatId),
        Number(messageId),
        truncated
      );
    } catch {
      // Silently ignore edit failures (rate limits, message unchanged, etc.)
    }
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    try {
      await this.bot.api.deleteMessage(Number(chatId), Number(messageId));
    } catch {
      // Silently ignore — message may already be deleted
    }
  }

  async sendTypingAction(chatId: string): Promise<void> {
    await this.bot.api.sendChatAction(Number(chatId), "typing");
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline near the limit
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) {
      // No good newline — split at space
      splitAt = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitAt < maxLen * 0.5) {
      // No good split point — hard split
      splitAt = maxLen;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}
