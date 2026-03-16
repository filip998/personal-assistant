export interface IncomingMessage {
  /** Platform-specific chat/conversation ID */
  chatId: string;
  /** Platform-specific user ID */
  userId: string;
  /** Display name of the sender */
  displayName: string;
  /** Message text content */
  text: string;
  /** Which platform this came from */
  platform: string;
}

export type MessageHandler = (msg: IncomingMessage) => Promise<void>;

export interface MessagingAdapter {
  /** Platform identifier (e.g. 'telegram', 'viber') */
  readonly platform: string;

  /** Start listening for messages */
  start(): Promise<void>;

  /** Stop the adapter gracefully */
  stop(): Promise<void>;

  /** Register a handler for incoming messages */
  onMessage(handler: MessageHandler): void;

  /** Send a text message to a chat. Returns the platform message ID. */
  sendMessage(chatId: string, text: string): Promise<string>;

  /** Edit an existing message */
  editMessage(chatId: string, messageId: string, text: string): Promise<void>;

  /** Delete a message */
  deleteMessage(chatId: string, messageId: string): Promise<void>;

  /** Show a "typing" indicator in the chat */
  sendTypingAction(chatId: string): Promise<void>;
}
