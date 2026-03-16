import type { Tool } from "@github/copilot-sdk";
import type { Plugin } from "./types.js";

export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();

  async register(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    if (plugin.onLoad) {
      await plugin.onLoad();
    }

    this.plugins.set(plugin.name, plugin);
    console.log(
      `[plugins] Registered "${plugin.name}" (${plugin.tools.length} tools)`
    );
  }

  async unregisterAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.onUnload) {
        await plugin.onUnload();
      }
    }
    this.plugins.clear();
  }

  /** Get all tools from all registered plugins */
  getAllTools(): Tool[] {
    const tools: Tool[] = [];
    for (const plugin of this.plugins.values()) {
      tools.push(...plugin.tools);
    }
    return tools;
  }

  /** Build a combined system prompt fragment from all plugins */
  getSystemPromptFragments(): string {
    const fragments: string[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.systemPromptFragment) {
        fragments.push(plugin.systemPromptFragment);
      }
    }
    return fragments.join("\n\n");
  }

  getPluginNames(): string[] {
    return [...this.plugins.keys()];
  }
}
