import {
  CopilotClient,
  CopilotSession,
  approveAll,
  type Tool,
  type MCPServerConfig,
} from "@github/copilot-sdk";
import { execSync } from "node:child_process";

export interface CopilotWrapperOptions {
  tools: Tool[];
  systemPrompt: string;
  model: string;
  mcpServers?: Record<string, MCPServerConfig>;
}

function getGitHubToken(): string {
  const envToken =
    process.env.COPILOT_GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN;
  if (envToken) return envToken;

  try {
    return execSync("gh auth token", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error(
      "No GitHub token found. Set GH_TOKEN or run 'gh auth login'."
    );
  }
}

/**
 * Inject auth headers into any MCP server config that points to githubcopilot.com.
 * This replicates what the CLI does in interactive mode but skips in SDK mode.
 */
function injectGitHubAuth(
  servers: Record<string, MCPServerConfig> | undefined,
  token: string
): Record<string, MCPServerConfig> | undefined {
  if (!servers) return servers;

  const result = { ...servers };
  for (const [key, config] of Object.entries(result)) {
    if (
      "url" in config &&
      config.url?.includes("githubcopilot.com")
    ) {
      const httpConfig = config as MCPServerConfig & {
        headers?: Record<string, string>;
      };
      httpConfig.headers = {
        Authorization: `Bearer ${token}`,
        "X-MCP-Toolsets":
          "repos,issues,users,pull_requests,actions,web_search",
        "X-MCP-Host": "github-coding-agent",
        ...httpConfig.headers,
      };
      result[key] = httpConfig;
      console.log(`[mcp] Injected GitHub auth into "${key}"`);
    }
  }
  return result;
}

/**
 * Thin wrapper around the Copilot SDK client.
 * Manages the CLI process lifecycle and session creation.
 */
export class CopilotWrapper {
  private client: CopilotClient;
  private options: CopilotWrapperOptions;

  constructor(options: CopilotWrapperOptions) {
    this.client = new CopilotClient();
    const token = getGitHubToken();
    this.options = {
      ...options,
      mcpServers: injectGitHubAuth(options.mcpServers, token),
    };
  }

  async start(): Promise<void> {
    console.log("[copilot] Starting Copilot CLI server...");
  }

  async stop(): Promise<void> {
    console.log("[copilot] Stopping Copilot CLI server...");
    await this.client.stop();
  }

  /** Get available model IDs */
  async listModels(): Promise<string[]> {
    const models = await this.client.listModels();
    return models.map((m) => m.id);
  }

  /** Create a new session with all registered tools */
  async createSession(model?: string): Promise<CopilotSession> {
    const session = await this.client.createSession({
      model: model || this.options.model,
      tools: this.options.tools,
      onPermissionRequest: approveAll,
      systemMessage: {
        mode: "append" as const,
        content: this.options.systemPrompt,
      },
      mcpServers: this.options.mcpServers,
    });

    console.log(`[copilot] Created session: ${session.sessionId}`);
    return session;
  }

  /** Resume an existing session by ID */
  async resumeSession(sessionId: string): Promise<CopilotSession> {
    const session = await this.client.resumeSession(sessionId, {
      tools: this.options.tools,
      onPermissionRequest: approveAll,
      mcpServers: this.options.mcpServers,
    });

    console.log(`[copilot] Resumed session: ${sessionId}`);
    return session;
  }
}
