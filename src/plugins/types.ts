import type { Tool } from "@github/copilot-sdk";

export interface Plugin {
  /** Unique plugin name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Copilot SDK tools this plugin provides */
  tools: Tool[];
  /** Additional instructions appended to the system prompt */
  systemPromptFragment?: string;
  /** Called when the plugin is loaded */
  onLoad?(): Promise<void>;
  /** Called when the plugin is unloaded */
  onUnload?(): Promise<void>;
}
