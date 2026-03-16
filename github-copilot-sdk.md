# GitHub Copilot SDK — Technical Deep-Dive

## Executive Summary

The [github/copilot-sdk](https://github.com/github/copilot-sdk) is a multi-platform SDK (Technical Preview, created January 2026) that lets developers embed GitHub Copilot's agentic runtime into their own applications. It ships implementations for **TypeScript/Node.js**, **Python**, **Go**, and **.NET** — all communicating with the Copilot CLI server process over **JSON-RPC**[^1]. The SDK exposes the same agent engine behind the Copilot CLI: planning, tool invocation, file edits, permission management, streaming events, custom tools, hooks, MCP integration, and BYOK (Bring Your Own Key) support. As of March 2026, the latest release is **v0.1.32** and the protocol is at **version 3**[^2][^3]. Notable contributors include Stephen Toub, Steve Sanderson, Brett Cannon, Patrick Nikoletich, and Shane Neuville — a mix of Microsoft and GitHub engineers[^4].

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Your Application                          │
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌──────┐  ┌───────────┐  │
│  │ Custom Tools │  │    Hooks    │  │ BYOK │  │ MCP Servers│  │
│  └──────┬──────┘  └──────┬──────┘  └──┬───┘  └─────┬─────┘  │
│         │                │            │             │         │
│  ┌──────▼────────────────▼────────────▼─────────────▼──────┐ │
│  │                    SDK Client                            │ │
│  │  (CopilotClient → Session → Event Handlers)             │ │
│  └──────────────────────────┬───────────────────────────────┘ │
└─────────────────────────────┼─────────────────────────────────┘
                              │ JSON-RPC (stdio or TCP)
                              ▼
              ┌───────────────────────────────┐
              │   Copilot CLI (server mode)   │
              │                               │
              │  ┌─────────┐  ┌────────────┐  │
              │  │  Agent   │  │  Built-in  │  │
              │  │  Engine  │  │   Tools    │  │
              │  └────┬────┘  └─────┬──────┘  │
              │       │             │          │
              │  ┌────▼─────────────▼───────┐  │
              │  │     LLM Provider         │  │
              │  │  (Copilot / BYOK / Azure)│  │
              │  └──────────────────────────┘  │
              └───────────────────────────────┘
```

**Core data flow:**
1. Application creates a `Client` and calls `Start()` / `start()`
2. The SDK either spawns a Copilot CLI child process (stdio) or connects to an external server (TCP)[^5]
3. A `Session` is created via JSON-RPC (`session.create`), returning a session ID
4. Messages are sent via `session.send`, which triggers the agent engine
5. The agent engine streams back events (assistant messages, tool calls, permission requests) as JSON-RPC notifications
6. Custom tools registered by the SDK are called via `tool.call` (v2) or `external_tool.requested` (v3) JSON-RPC requests[^6]
7. Permission requests flow through user-provided `PermissionHandler` callbacks[^7]

---

## Protocol & Code Generation

### Protocol Versioning

The SDK uses a versioned protocol tracked in `sdk-protocol-version.json` at the repo root[^2]:

```json
{ "version": 3 }
```

**Protocol v3** (introduced in v0.1.31) broadcasts `external_tool.requested` and `permission.requested` as session-scoped events to all connected clients, enabling multi-client architectures where different clients register different tools[^6]. Protocol v2 backward-compatibility was added in v0.1.32[^8].

### Code Generation Pipeline

RPC methods and session event types are **code-generated** from a shared schema via `scripts/codegen/`[^9]. Each SDK has `generated/` directories:

| SDK | Generated Files | Key Generated Types |
|-----|----------------|---------------------|
| **Node.js** | `nodejs/src/generated/rpc.ts`, `session-events.ts` (93KB) | `createSessionRpc()`, `createServerRpc()`, typed session events[^10] |
| **Python** | `python/copilot/generated/` | RPC methods, session event dataclasses[^11] |
| **Go** | `go/generated_session_events.go` (61KB), `go/rpc/generated_rpc.go` (26KB) | Typed event structs, `SessionRpc`/`ServerRpc`[^12] |
| **.NET** | `dotnet/src/Generated/` | Typed RPC and event classes[^13] |

The generator (`npm run generate` from `nodejs/`) reads a schema and produces strongly-typed wrappers for every JSON-RPC method and event, ensuring cross-language parity[^14].

---

## Node.js / TypeScript SDK

**Package:** `@github/copilot-sdk` (npm) — v0.1.8[^15]  
**Entry point:** `nodejs/src/index.ts`[^16]

### Key Source Files

| File | Size | Purpose |
|------|------|---------|
| `nodejs/src/client.ts` | 60KB | `CopilotClient` — process management, JSON-RPC connection, session factory[^17] |
| `nodejs/src/session.ts` | 28KB | `CopilotSession` — event dispatch, message send/receive, tool/permission handlers[^18] |
| `nodejs/src/types.ts` | 32KB | All public types, `defineTool()`, `approveAll()`[^19] |
| `nodejs/src/telemetry.ts` | 907B | Trace context via user-provided callback (no OTel dependency)[^20] |
| `nodejs/src/extension.ts` | 1.6KB | `joinSession()` for CLI child-process extensions[^21] |
| `nodejs/src/generated/rpc.ts` | 17KB | Generated typed RPC methods[^10] |
| `nodejs/src/generated/session-events.ts` | 93KB | Generated session event types[^10] |

### Core API Surface

```typescript
// Client lifecycle
const client = new CopilotClient(options?: CopilotClientOptions);
// start() is auto — spawns CLI or connects to CLIUrl
await client.stop();

// Session lifecycle
const session = await client.createSession(config: SessionConfig);
const session = await client.resumeSession(id, config: ResumeSessionConfig);
await session.disconnect();

// Messaging
const msgId = await session.send(options: MessageOptions);
const response = await session.sendAndWait(options: MessageOptions);

// Events
session.on((event: SessionEvent) => { ... });
session.on("assistant.message", (event) => { ... });

// Custom tools (Zod-based schema)
import { defineTool } from "@github/copilot-sdk";
const tool = defineTool("name", { handler, schema: z.object({...}) });

// Model switching
await session.setModel("gpt-4.1");
```

### Dependencies

- `@github/copilot` ^1.0.4 — CLI binary package[^15]
- `vscode-jsonrpc` ^8.2.1 — JSON-RPC transport[^15]
- `zod` ^4.3.6 — schema validation for `defineTool()`[^15]

### Extension API

The `@github/copilot-sdk/extension` subpath export provides `joinSession()` for building CLI extensions that run as child processes. It reads `SESSION_ID` from the environment and connects back to the parent CLI process[^21]:

```typescript
import { joinSession } from "@github/copilot-sdk/extension";
const session = await joinSession({ tools: [myTool] });
```

---

## Python SDK

**Package:** `github-copilot-sdk` (PyPI) — v0.1.0[^22]  
**Module:** `copilot`

### Key Source Files

| File | Size | Purpose |
|------|------|---------|
| `python/copilot/client.py` | 65KB | `CopilotClient` — process lifecycle, JSON-RPC, session creation[^23] |
| `python/copilot/session.py` | 30KB | `CopilotSession` — event handling, send/receive[^24] |
| `python/copilot/jsonrpc.py` | 14KB | Custom async JSON-RPC 2.0 client for stdio transport[^25] |
| `python/copilot/tools.py` | 7KB | `define_tool()` — Pydantic-based tool definition with decorator support[^26] |
| `python/copilot/types.py` | 38KB | All public types/dataclasses[^27] |
| `python/copilot/telemetry.py` | 1.4KB | Optional OpenTelemetry trace context extraction[^28] |

### JSON-RPC Implementation

Unlike Node.js (which uses `vscode-jsonrpc`), the Python SDK implements its own **minimal async JSON-RPC 2.0 client** using threading + asyncio[^25]:

```python
class JsonRpcClient:
    """Uses threads for blocking IO but provides async interface."""
    
    async def request(self, method, params=None, timeout=None) -> Any: ...
    async def notify(self, method, params=None): ...
    def set_request_handler(self, method, handler): ...
```

Key design decisions:
- **Threading for I/O**: `_read_loop()` runs in a daemon thread to avoid asyncio subprocess issues[^25]
- **Content-Length framing**: Standard JSON-RPC over stdio with `Content-Length` headers[^25]
- **Configurable timeout**: `timeout` parameter on RPC methods (added v0.1.31)[^29]

### Tool Definition (Decorator Pattern)

```python
from copilot import define_tool
from pydantic import BaseModel, Field

class WeatherParams(BaseModel):
    city: str = Field(description="City name")

@define_tool(description="Get weather for a city")
def get_weather(params: WeatherParams) -> str:
    return f"Weather in {params.city}: 22°C"
```

The decorator introspects type hints to auto-detect Pydantic models and generate JSON schemas[^26]. It supports 4 handler signatures: `()`, `(invocation)`, `(params)`, `(params, invocation)`.

### Dependencies

- `python-dateutil` >=2.9.0
- `pydantic` >=2.0 (tool schema generation)[^22]
- Optional: `opentelemetry-api` >=1.0.0 (for trace context)[^22]

---

## Go SDK

**Module:** `github.com/github/copilot-sdk/go`[^30]  
**Go version:** 1.24+

### Key Source Files

| File | Size | Purpose |
|------|------|---------|
| `go/client.go` | 48KB | `Client` struct — process/TCP management, session factory[^5] |
| `go/session.go` | 26KB | `Session` struct — event dispatch via channels, Send/SendAndWait[^31] |
| `go/types.go` | 39KB | All public types, `ClientOptions`, `SessionConfig`, `PermissionRequest`[^32] |
| `go/definetool.go` | 4KB | `DefineTool[T, U]()` — generic typed tool definition[^33] |
| `go/permissions.go` | 398B | `PermissionHandler.ApproveAll` convenience[^7] |
| `go/telemetry.go` | 947B | W3C Trace Context via OTel propagator[^34] |
| `go/generated_session_events.go` | 61KB | Generated event types[^12] |
| `go/rpc/generated_rpc.go` | 26KB | Generated typed RPC methods[^12] |

### Internal Packages

```
go/internal/
├── embeddedcli/  — Embedded CLI installer (lazy install from bundled binary)[^35]
├── flock/        — File-locking for concurrent CLI access
├── jsonrpc2/     — Custom JSON-RPC 2.0 client implementation
└── e2e/          — End-to-end test utilities
```

### Type-Safe Tool Definition (Generics)

Go uses generics for type-safe tool definitions[^33]:

```go
type GetWeatherParams struct {
    City string `json:"city" jsonschema:"city name"`
    Unit string `json:"unit" jsonschema:"temperature unit"`
}

tool := copilot.DefineTool("get_weather", "Get weather for a city",
    func(params GetWeatherParams, inv copilot.ToolInvocation) (any, error) {
        return fmt.Sprintf("Weather in %s: 22°%s", params.City, params.Unit), nil
    })
```

Schema generation uses `github.com/google/jsonschema-go` for reflection-based JSON Schema from Go structs[^33].

### Embedded CLI Support

The `go/embeddedcli` package allows Go applications to **bundle the CLI binary** and install it lazily at runtime[^35]:

```go
import "github.com/github/copilot-sdk/go/embeddedcli"

embeddedcli.Setup(embeddedcli.Config{
    Cli:     cliBytes,     // embedded binary
    CliHash: "sha256:...", // integrity check
    Version: "1.0.4",
})
```

### Dependencies

- `github.com/google/jsonschema-go` v0.4.2 — JSON Schema from Go types[^30]
- `github.com/klauspost/compress` v1.18.3 — compression for embedded CLI[^30]
- `github.com/google/uuid` v1.6.0 — request IDs[^30]
- `go.opentelemetry.io/otel` v1.35.0 — trace context propagation[^30]

---

## .NET SDK

**Package:** `GitHub.Copilot.SDK` (NuGet) — v0.1.0[^36]  
**Namespace:** `GitHub.Copilot.SDK`

### Key Source Files

| File | Size | Purpose |
|------|------|---------|
| `dotnet/src/Client.cs` | 70KB | `CopilotClient` — process management, JSON-RPC via StreamJsonRpc[^37] |
| `dotnet/src/Session.cs` | 36KB | `CopilotSession` — events, messaging, hooks[^38] |
| `dotnet/src/Types.cs` | 70KB | All public types[^39] |
| `dotnet/src/PermissionHandlers.cs` | 711B | `PermissionHandler.ApproveAll`[^40] |
| `dotnet/src/Telemetry.cs` | 2.1KB | `System.Diagnostics.Activity` trace context[^41] |
| `dotnet/src/SdkProtocolVersion.cs` | 539B | Protocol version constant[^42] |

### NativeAOT Compatibility

The .NET SDK is marked `<IsAotCompatible>true</IsAotCompatible>` and uses source-generated JSON serialization contexts for System.Text.Json, making it compatible with NativeAOT/trimming[^36]. A `StreamJsonRpcTypeInfoResolver` fallback handles StreamJsonRpc internal types like `RequestId` for edge cases during cancellation[^43].

### Integration with Microsoft.Extensions.AI

The SDK depends on `Microsoft.Extensions.AI.Abstractions`, meaning tools can be defined using `AIFunctionFactory` — the standard .NET AI function abstraction[^36]:

```csharp
using GitHub.Copilot.SDK;

var tool = AIFunctionFactory.Create(
    ([Description("City name")] string city) => $"Weather in {city}: 22°C",
    "get_weather", "Get weather for a city"
);

await using var session = await client.CreateSessionAsync(new SessionConfig {
    Tools = [tool],
    OnPermissionRequest = PermissionHandler.ApproveAll,
});
```

### Dependencies

- `Microsoft.Extensions.AI.Abstractions` — AI tool abstraction[^36]
- `Microsoft.Extensions.Logging.Abstractions` — logging[^36]
- `StreamJsonRpc` — JSON-RPC transport (compiled privately)[^36]
- `System.Text.Json` — JSON serialization[^36]

---

## Features & Capabilities

### Authentication Methods

| Method | Description | Requires Copilot Subscription |
|--------|-------------|-------------------------------|
| **Signed-in CLI user** | Uses stored OAuth from `copilot` login | Yes |
| **OAuth GitHub App** | Pass user tokens from your GitHub OAuth app | Yes |
| **Environment variables** | `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN` | Yes |
| **BYOK** | Own API keys (OpenAI, Azure, Anthropic, Ollama, Foundry Local) | No[^44] |

### BYOK Provider Support

| Provider | Type Value | Notes |
|----------|-----------|-------|
| OpenAI | `"openai"` | Direct API and compatible endpoints[^44] |
| Azure OpenAI / AI Foundry | `"azure"` or `"openai"` | Depending on endpoint style[^44] |
| Anthropic | `"anthropic"` | Claude models[^44] |
| Ollama | `"openai"` | Local models[^44] |
| Microsoft Foundry Local | `"openai"` | Local on-device models[^44] |

### Hooks System

The SDK supports lifecycle hooks for intercepting session behavior[^45]:

| Hook | When Fired | Can Modify |
|------|-----------|------------|
| `preToolUse` | Before tool execution | Approve/deny/modify tool params |
| `postToolUse` | After tool execution | Transform tool results |
| `userPromptSubmitted` | User sends a message | Modify/filter the prompt |
| Session lifecycle | Session start/end | Monitor lifecycle events |
| Error handling | On errors | Custom error handling |

### Custom Agents & Skills

- **Custom Agents**: Define sub-agents with their own system prompts, tools, and model preferences[^45]
- **Skills**: Reusable prompt modules that can be loaded into sessions[^45]
- **MCP Servers**: Integrate Model Context Protocol servers for additional tool sources[^45]

### Session Persistence

Sessions can be persisted across restarts, with workspace paths containing `checkpoints/`, `plan.md`, and `files/` subdirectories[^31][^18].

### Streaming Events

The SDK provides real-time streaming of session events including:
- `assistant.message` — final response content
- `assistant.message.delta` — streaming token deltas
- `tool.call` / `external_tool.requested` — tool invocations
- `permission.requested` / `permission.completed` — permission flow
- `session.idle` — agent finished processing
- `session.error` — error events[^10]

### OpenTelemetry Integration

All SDKs support W3C Trace Context propagation for distributed tracing[^46]:

- **Node.js**: User-provided `TraceContextProvider` callback (no OTel dependency)[^20]
- **Python**: Optional `opentelemetry-api` import[^28]
- **Go**: Direct `go.opentelemetry.io/otel` integration[^34]
- **.NET**: `System.Diagnostics.Activity` (built-in .NET tracing)[^41]

Plus a `TelemetryConfig` for configuring the CLI process's own OTLP exporter[^32].

---

## Testing Strategy

### Unit Tests

Each SDK has its own unit test suite[^47]:

| SDK | Test Runner | Key Test Files |
|-----|-------------|----------------|
| **Node.js** | Vitest | `nodejs/test/` |
| **Python** | pytest + pytest-asyncio | `python/test_client.py`, `test_jsonrpc.py`, `test_telemetry.py`, `test_rpc_timeout.py`, `test_event_forward_compatibility.py` |
| **Go** | `go test` | `go/client_test.go`, `go/session_test.go`, `go/definetool_test.go`, `go/types_test.go`, `go/telemetry_test.go` |
| **.NET** | `dotnet test` | `dotnet/test/GitHub.Copilot.SDK.Test.csproj` |

### Cross-Language Scenario Tests

The `test/scenarios/` directory contains **end-to-end scenario tests** that verify consistent behavior across all four SDKs[^48]:

```
test/scenarios/
├── auth/          — authentication scenarios
├── bundling/      — CLI bundling scenarios
├── callbacks/     — event callback scenarios
├── modes/         — message delivery modes
├── prompts/       — prompt handling
├── sessions/      — session management
├── tools/         — custom tool scenarios
├── transport/     — stdio/TCP transport
└── verify.sh      — orchestrator script
```

A shared test harness (`test/harness/`, written in Node.js) drives the verification[^48]. The `justfile` provides `scenario-build` and `scenario-verify` targets[^49].

### Documentation Validation

Code examples in documentation are extracted and validated per-language via `scripts/docs-validation/`[^49].

---

## Development & Build Infrastructure

### Justfile Commands

The repo uses `just` as a task runner[^49]:

| Command | Purpose |
|---------|---------|
| `just test` | Run all tests across all languages |
| `just lint` | Lint all code |
| `just format` | Format all code |
| `just scenario-build` | Build all scenario samples |
| `just scenario-verify` | Full E2E verification |
| `just validate-docs` | Validate documentation examples |
| `just install` | Install all dependencies |

### Key Contributors (from recent commits)

| Contributor | Role | Recent Focus |
|-------------|------|-------------|
| **Stephen Toub** (`@stephentoub`) | Microsoft/.NET | OTel, docs, protocol compat[^4] |
| **Brett Cannon** (`@brettcannon`) | Python Core Dev | Python SDK API improvements[^4] |
| **Patrick Nikoletich** (`@patniko`) | GitHub | Cross-SDK features (reasoningEffort, setModel)[^4] |
| **Steve Sanderson** (`@SteveSandersonMS`) | Microsoft/Blazor | .NET SDK, contribution guide[^4] |
| **Shane Neuville** (`@PureWeen`) | Microsoft/.NET MAUI | .NET AOT fixes, devcontainer[^4] |

---

## Key Repositories Summary

| Repository | Purpose | Key Files |
|------------|---------|-----------|
| [github/copilot-sdk](https://github.com/github/copilot-sdk) | Multi-platform SDK (TS, Python, Go, .NET) | `nodejs/src/client.ts`, `python/copilot/client.py`, `go/client.go`, `dotnet/src/Client.cs` |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | Cookbook, instructions, community resources | `cookbook/copilot-sdk/`, `instructions/copilot-sdk-*.instructions.md` |
| [copilot-community-sdk/copilot-sdk-java](https://github.com/copilot-community-sdk/copilot-sdk-java) | Unofficial Java SDK | Community-maintained |
| [copilot-community-sdk/copilot-sdk-rust](https://github.com/copilot-community-sdk/copilot-sdk-rust) | Unofficial Rust SDK | Community-maintained |
| [copilot-community-sdk/copilot-sdk-clojure](https://github.com/copilot-community-sdk/copilot-sdk-clojure) | Unofficial Clojure SDK | Community-maintained |
| [0xeb/copilot-sdk-cpp](https://github.com/0xeb/copilot-sdk-cpp) | Unofficial C++ SDK | Community-maintained |

---

## Confidence Assessment

| Aspect | Confidence | Notes |
|--------|-----------|-------|
| **Architecture & data flow** | ✅ High | Verified from source code across all 4 SDKs |
| **API surface** | ✅ High | Read from actual source files and types |
| **Protocol versioning** | ✅ High | Confirmed from `sdk-protocol-version.json` and CHANGELOG |
| **Code generation pipeline** | 🟡 Medium | Saw generated files and `scripts/codegen/` dir, but did not read generator source |
| **BYOK configuration** | ✅ High | Full docs/auth/byok.md read |
| **Internal CLI implementation** | 🟡 Medium | CLI is a separate package (`@github/copilot`); SDK communicates via JSON-RPC but CLI internals are opaque |
| **Contributor roles** | 🟡 Medium | Inferred from commit history and GitHub profiles |
| **Community SDKs** | ⚪ Low | Only linked from README; not verified |

---

## Footnotes

[^1]: `README.md` — "All SDKs communicate with the Copilot CLI server via JSON-RPC"
[^2]: `sdk-protocol-version.json` — `{"version": 3}`
[^3]: `CHANGELOG.md` — v0.1.32 entry (2026-03-07)
[^4]: Recent commits on `main` branch (2026-03-13 through 2026-03-16)
[^5]: `go/client.go:1-200` — `Client` struct, `NewClient()`, transport selection (stdio vs TCP)
[^6]: `CHANGELOG.md` — v0.1.31: "protocol version 3, where the runtime broadcasts `external_tool.requested` and `permission.requested` as session events"
[^7]: `go/permissions.go` — `PermissionHandler.ApproveAll` implementation
[^8]: `CHANGELOG.md` — v0.1.32: "backward compatibility with v2 CLI servers"
[^9]: `scripts/codegen/` directory
[^10]: `nodejs/src/generated/rpc.ts` (17KB), `nodejs/src/generated/session-events.ts` (93KB)
[^11]: `python/copilot/generated/` directory
[^12]: `go/generated_session_events.go` (61KB), `go/rpc/generated_rpc.go` (26KB)
[^13]: `dotnet/src/Generated/` directory
[^14]: `nodejs/package.json` — `"generate": "cd ../scripts/codegen && npm run generate"`
[^15]: `nodejs/package.json` — package metadata, dependencies, version 0.1.8
[^16]: `nodejs/src/index.ts` — public exports
[^17]: `nodejs/src/client.ts` — 60KB, `CopilotClient` class
[^18]: `nodejs/src/session.ts` — `CopilotSession` class with event handlers, send/sendAndWait
[^19]: `nodejs/src/types.ts` — 32KB of type definitions
[^20]: `nodejs/src/telemetry.ts` — callback-based trace context (no OTel dependency)
[^21]: `nodejs/src/extension.ts` — `joinSession()` for CLI child-process extensions
[^22]: `python/pyproject.toml` — package metadata, dependencies
[^23]: `python/copilot/client.py` — 65KB, `CopilotClient` class
[^24]: `python/copilot/session.py` — 30KB, `CopilotSession` class
[^25]: `python/copilot/jsonrpc.py` — custom JSON-RPC 2.0 implementation with threading
[^26]: `python/copilot/tools.py` — `define_tool()` with Pydantic schema generation
[^27]: `python/copilot/types.py` — 38KB of type definitions
[^28]: `python/copilot/telemetry.py` — optional OpenTelemetry import
[^29]: `CHANGELOG.md` — v0.1.31: "add `timeout` parameter to generated RPC methods"
[^30]: `go/go.mod` — module path, Go 1.24, dependencies
[^31]: `go/session.go:1-200` — `Session` struct, `Send()`, `SendAndWait()`, event channel
[^32]: `go/types.go:1-200` — `ClientOptions`, `TelemetryConfig`, `SessionConfig`, permission types
[^33]: `go/definetool.go` — `DefineTool[T, U]()` generic function with JSON Schema generation
[^34]: `go/telemetry.go` — `getTraceContext()` using `go.opentelemetry.io/otel`
[^35]: `go/embeddedcli/installer.go` — `Setup(Config)` for embedded CLI binary
[^36]: `dotnet/src/GitHub.Copilot.SDK.csproj` — NuGet metadata, AOT compatibility, dependencies
[^37]: `dotnet/src/Client.cs` — 70KB, `CopilotClient` class using StreamJsonRpc
[^38]: `dotnet/src/Session.cs` — 36KB, `CopilotSession` class
[^39]: `dotnet/src/Types.cs` — 70KB of type definitions
[^40]: `dotnet/src/PermissionHandlers.cs` — `PermissionHandler.ApproveAll`
[^41]: `dotnet/src/Telemetry.cs` — `System.Diagnostics.Activity` trace context helpers
[^42]: `dotnet/src/SdkProtocolVersion.cs`
[^43]: Commit `a29dc1877f` — "add fallback TypeInfoResolver for StreamJsonRpc.RequestId"
[^44]: `docs/auth/byok.md` — BYOK provider configuration, supported providers
[^45]: `docs/index.md` — documentation map listing features, hooks, custom agents, MCP, skills
[^46]: Commit `f2d21a0b4a` — "add OpenTelemetry support across all SDKs"
[^47]: `CONTRIBUTING.md` — test commands per SDK
[^48]: `test/scenarios/` directory — auth, bundling, callbacks, modes, prompts, sessions, tools, transport
[^49]: `justfile` — task runner with test, lint, format, scenario, docs-validation targets
