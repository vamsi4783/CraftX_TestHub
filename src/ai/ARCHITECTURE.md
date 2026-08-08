# AI Connector Platform — Architecture

## Principle

> Treat AI as a pluggable infrastructure layer, exactly like the Driver architecture.
> Features must never know whether a response came from a cloud API, a local model,
> or an MCP agent. The AI Connector Platform is the single abstraction boundary
> for all AI capabilities.

---

## Module layout

```
src/ai/
├── core/               Interfaces only — IAIConnector, IAIProvider, IAIAgent
├── types/              Shared value types — AIRequest, AIResponse, AIConnectorCapabilities, …
├── registry/           AIConnectorRegistry — register, lookup, health, capability filter
├── orchestrator/       AIOrchestrator — the only class features call
├── settings/           AISettings model and CONNECTOR_IDS constants
├── telemetry/          IAITelemetry, NoOpTelemetry, InMemoryTelemetry
├── cache/              IAICache, NoOpCache, InMemoryAICache
├── connectors/         BaseConnector abstract class
├── providers/          BaseProviderAdapter + adapter stubs (not implemented)
├── agents/             BaseAgentAdapter + adapter stubs (not implemented)
└── index.ts            Public API — the only import path features use
```

---

## Layer diagram

```
Feature (M6–M9)
      │
      ▼
AIOrchestrator          ← only class features call
      │
      ├─── AIConnectorRegistry  ← holds registered connectors
      │          │
      │          ├── IAIConnector (interface)
      │          │       ├── IAIProvider  (hosted/local APIs)
      │          │       └── IAIAgent     (MCP agents)
      │          │
      │          └── concrete implementations (future, not in this module)
      │
      ├─── RetryConfig / fallback logic
      └─── TelemetryHook callbacks
```

---

## Adding a real connector (future milestone)

1. Implement `IAIProvider` or `IAIAgent` (or subclass `BaseProviderAdapter` / `BaseAgentAdapter`).
2. In the app bootstrap, call `registry.register(new MyConnector(), { priority: 50 })`.
3. Features are unchanged — `AIOrchestrator.execute()` picks it automatically.

No feature file needs to change when a connector is added, swapped, or removed.

---

## Connector types

| Type           | Interface      | Examples                                          |
|----------------|---------------|---------------------------------------------------|
| `api_provider` | IAIProvider   | Gemini, Claude, OpenAI, GitHub Models, OpenRouter |
| `local_model`  | IAIProvider   | Ollama, LM Studio, vLLM                           |
| `mcp_agent`    | IAIAgent      | Claude Code MCP, Cursor, Gemini CLI, Copilot      |

---

## Orchestrator behavior

1. Filter registry by capability predicate (optional).
2. Sort enabled connectors ascending by priority (lower number = higher priority).
3. For each candidate:
   - Optional health-check gate (`requireHealthCheck`).
   - Call `connector.execute()` with `Promise.race` timeout.
   - On failure, retry up to `retry.maxAttempts` with exponential backoff.
   - On exhaustion, emit `fallback_triggered` and move to next candidate.
4. If all candidates fail, throw `AIConnectorError { code: 'ALL_FAILED' }`.

---

## Connector priority

Lower number = tried first.

| Range    | Intended use                          |
|----------|---------------------------------------|
| 1–49     | Primary / premium connectors          |
| 50–149   | Standard connectors (default: 100)    |
| 150–249  | Fallback / free-tier connectors       |
| 250+     | Last-resort / debug connectors        |

---

## What is NOT in this module

- No UI — settings model only, no React components.
- No Supabase / edge function changes.
- No billing or key management logic.
- No changes to existing M6–M9 features.

---

## Milestone 2 — Production Connectors

M2 replaced stubs with production-ready implementations and added observability infrastructure.

### Production connectors added

| Class | File | Notes |
|---|---|---|
| `GeminiFlashConnector` | `providers/GeminiFlashConnector.ts` | API key in URL query param; SSE streaming; vision; JSON mode |
| `OllamaConnector` | `providers/OllamaConnector.ts` | Local endpoint; NDJSON streaming; model discovery |
| `OpenAICompatibleConnector` | `providers/OpenAICompatibleConnector.ts` | One class for Groq, OpenRouter, vLLM, LM Studio, Together, Azure, GitHub Models, etc. |
| `GenericMCPConnector` | `agents/GenericMCPConnector.ts` | Transport-injectable (stdio/SSE/WebSocket); sampling + tool fallback |

### Security

`SecureString` (`security/SecureString.ts`) — private-field wrapper for API keys. `toString()` / `toJSON()` / Node inspect all return `[REDACTED]`. Only `.reveal()` exposes the raw value at the call site.

### Shared stream utilities

`providers/shared/streamUtils.ts` exports:

- `Fetcher` — injectable fetch type for test isolation.
- `parseSSELines()` — strips `data: `, stops on `[DONE]`.
- `parseNDJSON()` — line-by-line JSON objects (Ollama).
- `makeTimeoutController()` — races AbortController against a timer; `timedOut` flag distinguishes timeout from user cancel.
- `extractErrorMessage()` — reads error detail from failed Response.

### Factory

`AIConnectorFactory` (`factory/AIConnectorFactory.ts`) — creates connectors from `AIConnectorConfig` / `AISettings`.

- Dispatch map keyed by connector ID; no switch statements in feature code.
- `registerBuilder(id, fn)` — extend without modifying existing code.
- `fromSettings(settings)` — builds and returns a populated `AIConnectorRegistry`.
- `_testFetcher` — static test injection point; avoids real HTTP in tests.

### Health monitoring

`ConnectorHealthMonitor` (`health/ConnectorHealthMonitor.ts`) — implements `TelemetryHook`.

- Plugs into `AIOrchestrator`'s `telemetryHooks` array.
- Tracks per-connector: request count, success/failure counts, rolling 20-sample latency average, availability ratio, last-success / last-failure timestamps.
- Status transitions: `connected` → `degraded` → `error` based on success history.
- `reset(connectorId?)` — clear one or all connector stats.

### Diagnostics

`ConnectorDiagnostics` (`diagnostics/ConnectorDiagnostics.ts`) — assembles a `ConnectorDiagnosticReport` from live health + monitor stats.

- `getDiagnostics(connector, monitor?)` — single connector report.
- `getAllDiagnostics(connectors[], monitor?)` — parallel batch.
- `formatDiagnosticsSummary(report)` — human-readable text summary.

### Test coverage (M2)

Seven new test files, 170+ deterministic tests. Zero real HTTP calls — all connectors accept an injectable `fetcher?` option.

| File | Tests |
|---|---|
| `__tests__/ai/gemini.test.ts` | ~35 |
| `__tests__/ai/ollama.test.ts` | ~35 |
| `__tests__/ai/openai-compatible.test.ts` | ~30 |
| `__tests__/ai/mcp.test.ts` | ~30 |
| `__tests__/ai/factory.test.ts` | ~25 |
| `__tests__/ai/health-monitor.test.ts` | ~28 |
| `__tests__/ai/diagnostics.test.ts` | ~20 |

---

## Phase 5.5 M4 — AI Connector Runtime Integration

M4 wires the AI Connector Platform into TestHub's live AI features (M6 Test Generator, M8 Failure Analysis, M9 Regression Analysis). Before M4, all three features called Supabase edge functions directly; after M4, they route through `AIOrchestrationService` first and fall back to edge functions only when no connectors are configured.

### Product principle: no TestHub-owned API key required

TestHub does NOT need to own an Anthropic/OpenAI API key for normal AI operation. Users bring their own keys (Gemini, OpenAI-compatible) or run local models (Ollama). The edge function fallback path uses `ANTHROPIC_API_KEY` stored in Deno environment — only active when the user has not configured any connector.

### AIOrchestrationService (`src/features/ai-connectors/aiOrchestrationService.ts`)

Singleton bridge between the feature layer (M6/M8/M9) and the connector platform.

**Connector lifecycle:**
1. `aiConnectorStore.list()` — reads persisted connector configurations
2. Filter to enabled, non-MCP connectors sorted by priority
3. `AIConnectorFactory.fromConfig(toConfig(c))` — builds live `IAIConnector` instances, injecting credentials from `SecureCredentialStore`
4. Register in `AIConnectorRegistry` → `AIOrchestrator(registry, RUNTIME_CONFIG)`

`RUNTIME_CONFIG` has `fallbackEnabled: true`, `requireHealthCheck: false`, `timeoutMs: 30_000`, `retry.maxAttempts: 1` (service layer relies on multi-connector fallback, not per-connector retry).

**Credential flow:** API keys are retrieved via `SecureCredentialStore.retrieve(connectorId)` which returns a `SecureString`. The `SecureString.reveal()` method is called only inside `AIConnectorFactory` when building the connector — never passed through the orchestrator, never logged, never included in `AIRequest`.

**Orchestrator flow:**
```
AIOrchestrationService.execute(request)
  → _buildOrchestrator() (lazy, invalidated on connector changes)
  → AIOrchestrator.execute(request, caps => caps.supportsJSON)
  → tries connectors in priority order (Ollama first by default)
  → returns AIResponse { text, provider, connector, model, latency }
```

**Invalidation:** `aiOrchestrationService.invalidate()` is called when connectors are added, removed, toggled, or re-prioritised. `useAIConnectors` and `AddConnectorDialog` call it automatically.

### M6/M8/M9 two-path routing

Each engine follows the same pattern:

```typescript
let orchestratorSucceeded = false;
if (aiOrchestrationService.hasUsableConnectors()) {
  try {
    const response = await aiOrchestrationService.execute({ ... });
    raw = parseJSONFromText(response.text);
    orchestratorSucceeded = true;
  } catch { /* fall through */ }
}
if (!orchestratorSucceeded) {
  // Supabase edge function fallback
}
```

`parseJSONFromText` strips markdown code fences before `JSON.parse` — handles LLMs that wrap JSON in \`\`\`json blocks.

### Free/local-first priority

Default connector priority:
1. **Ollama** (local) — zero cost, zero latency, fully private
2. **Gemini** (free tier) — Google's free quota
3. **User API key** (OpenAI-compatible / Gemini paid) — user's own billing

The orchestrator respects the user's configured priority order; this is only the suggested default.

### MCP architecture

MCP connectors are **registered for display** in `getStatus().fallbackChain` but **excluded from text generation** (`usableConnectors()` filters `kind !== 'mcp'`). Browser-accessible MCP transports do not exist in M4; MCP is a future capability placeholder.

### GitHub is NOT a runtime dependency

TestHub does not call any GitHub API at runtime. GitHub is used only for source control and CI. AI features have no dependency on GitHub Copilot or any GitHub service.

### Security boundaries

- API keys stored in `sessionStorage` via `SecureCredentialStore`, never `localStorage` or cookies
- `SecureString.toString()` / `toJSON()` always return `[REDACTED]`
- `executeTestPrompt()` strips `Bearer \S+` patterns from all error messages before returning
- Keys never appear in `AIRequest`, logs, telemetry, URLs, or browser DOM

### Test coverage (M4)

Three new integration test files, 80+ tests.

| File | Tests | Coverage |
|---|---|---|
| `__tests__/ai-connectors/aiOrchestrationService.test.ts` | ~40 | Service unit: connector selection, priority, fallback, security, status |
| `__tests__/ai-connectors/m6-integration.test.ts` | ~8 | M6 routing: orchestrator path, edge fallback, both-fail, no direct imports |
| `__tests__/ai-connectors/m8-integration.test.ts` | ~7 | M8 routing: orchestrator path, edge fallback, safe defaults, confidence clamp |
| `__tests__/ai-connectors/m9-integration.test.ts` | ~8 | M9 routing: orchestrator path, edge fallback, requestId format, safe defaults |
