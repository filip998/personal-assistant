import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { SQLiteDatabase } from "./db/sqlite.js";
import { TelegramAdapter } from "./adapters/telegram.js";
import { CopilotWrapper } from "./core/copilot-client.js";
import { SessionManager } from "./core/session-manager.js";
import { UserManager } from "./core/user-manager.js";
import { Engine } from "./core/engine.js";
import { PluginRegistry } from "./plugins/registry.js";
import { loadPrompts } from "./core/prompt-loader.js";

const DEFAULT_PROMPT = `You are a helpful personal assistant. You are friendly, concise, and proactive.
You help the user with everyday tasks: answering questions, searching the web, planning, giving tips and advice.
When you don't know something, say so honestly.
Keep responses concise but thorough. Use markdown formatting when it helps readability.`;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  console.log("🤖 Starting Personal Assistant...\n");

  // Load config
  const config = loadConfig();

  // Initialize database
  const db = new SQLiteDatabase(config.dbPath);
  db.migrate();

  // Set up plugin registry (for future custom plugins)
  const plugins = new PluginRegistry();

  // Load system prompt from prompts/ directory
  const { prompt: loadedPrompt, files: promptFiles } = loadPrompts(
    resolve(projectRoot, "prompts")
  );
  const basePrompt = loadedPrompt || DEFAULT_PROMPT;

  // Append plugin prompt fragments
  const pluginPromptParts = plugins.getSystemPromptFragments();
  const fullSystemPrompt = pluginPromptParts
    ? `${basePrompt}\n\n${pluginPromptParts}`
    : basePrompt;

  // Initialize Copilot SDK with MCP servers from config
  const mcpConfig = JSON.parse(
    readFileSync(resolve(projectRoot, "mcp-servers.json"), "utf-8")
  );
  console.log(
    `[mcp] Loaded ${Object.keys(mcpConfig.mcpServers).length} MCP server(s): ${Object.keys(mcpConfig.mcpServers).join(", ")}`
  );

  const copilot = new CopilotWrapper({
    tools: plugins.getAllTools(),
    systemPrompt: fullSystemPrompt,
    model: config.model,
    mcpServers: mcpConfig.mcpServers,
  });
  await copilot.start();

  // Initialize managers
  const userManager = new UserManager(db, config);
  const sessionManager = new SessionManager(copilot, db);

  // Set up engine with adapters
  const engine = new Engine(sessionManager, userManager, db, copilot, config);
  engine.addAdapter(new TelegramAdapter(config.telegramBotToken));

  // Start the engine
  await engine.start();

  console.log("\n✅ Personal Assistant is running!");
  console.log(`   Prompts: ${loadedPrompt ? promptFiles.join(", ") : "(using default)"}`);
  console.log(`   Plugins: ${plugins.getPluginNames().join(", ") || "(none)"}`);
  console.log("   Press Ctrl+C to stop.\n");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down...`);
    await engine.stop();
    await copilot.stop();
    await plugins.unregisterAll();
    db.close();
    console.log("👋 Goodbye!");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
