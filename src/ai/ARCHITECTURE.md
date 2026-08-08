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
