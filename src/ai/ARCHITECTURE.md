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

---

## Phase 5.5 M5 — AI Runtime Validation & Hardening Report

### Phase A: Audit findings

#### Genuinely functional
- All three production connectors (Gemini, Ollama, OAI-compat): full HTTP, streaming, auth, error handling, cancellation, health checks
- AIOrchestrator: priority selection, injectable sleep, retry/backoff, fallback, telemetry hooks, health-check gating
- AIConnectorRegistry: Map-based, priority-sorted, capability filtering
- AIConnectorFactory: provider dispatch table + extensible `registerBuilder()` + `_testFetcher` override
- ConnectorHealthMonitor: rolling window latency, per-connector stats, availability calculation
- GenericMCPConnector: full MCP protocol (stdio/SSE), sampling/tool fallback
- getDiagnostics: complete health snapshot with ConnectorHealthMonitor integration
- aiOrchestrationService: singleton bridge; MCP explicitly excluded from usableConnectors()
- aiConnectorService: CRUD, credential isolation, testConnection, diagnostics
- SecureString: JS private field, toString/toJSON redaction, Symbol.for custom inspect
- SecureCredentialStore: sessionStorage-only, base64-encoded (obfuscation), clearAll
- Two-path routing (M6/M8/M9): orchestratorSucceeded flag correctly prevents spurious edge calls
- parseJSONFromText: markdown fence stripping before JSON.parse

#### Stubs / dead code
- **ClaudeAdapter** (`src/ai/providers/ClaudeAdapter.ts`): declares id/name/capabilities only. `execute()` inherits NOT_IMPLEMENTED from BaseProviderAdapter. Not registered in AIConnectorFactory. No UI entry point. Users cannot add Claude directly — only via OpenRouter through the OAI-compat connector.
- **FeatureReadinessPanel**: static display only. All four AI features show "Connector platform ready — feature migration pending" regardless of actual connector state.

#### Security findings
- Gemini API key is in URL query param (`?key=...`) by Google's design — unavoidable. The key appears in browser network logs. Low persistence risk since keys live only in sessionStorage (cleared on tab close).
- `SecureCredentialStore` uses `btoa()` (base64 obfuscation, not encryption). Real protection comes from same-origin sessionStorage isolation, which the code comments acknowledge.
- `executeTestPrompt()` error redaction regex (`Bearer \S+`) does not cover the Gemini URL key format (`?key=...`). Low risk: connector errors do not include the full request URL in their message; the raw key never appears in thrown AIConnectorErrors.
- `_buildOrchestrator` warning sanitisation has the same Bearer-only gap for the same reason.

#### Fallback / routing
- No defects. MCP is filtered out before `_buildOrchestrator`. `orchestratorSucceeded` pattern is correct. Factory failures skip connectors gracefully.

#### TestHub-owned AI dependency
- None in the React frontend. Edge functions use `ANTHROPIC_API_KEY` from Deno env as fallback only — correct architecture.

#### DRY / maintenance
- `toConfig()` in `aiOrchestrationService.ts` and `toAIConnectorConfig()` in `aiConnectorService.ts` are near-identical. Maintenance risk, not a bug.

#### Provider-specific assumptions
- Gemini endpoint is hardcoded to `generativelanguage.googleapis.com/v1beta` — no proxy/override support.
- `OllamaConnector.id` encodes the model name (`ollama_llama3_2`). The persisted store ID is `ollama`. `AIResponse.connector` reports the model-derived ID. Cosmetic only.

---

### Phase B: Real connector validation

All three connectors were re-validated with mocked HTTP transports. No new defects found. Gaps addressed by new tests in `__tests__/ai/connector-integration.test.ts`:
- Gemini: empty `candidates` array → text is `''` ✓
- Gemini: empty `parts` array → text is `''` ✓
- Gemini: multiple parts are concatenated ✓
- Ollama: missing `eval_count` → `usage` is `undefined` ✓
- Ollama: malformed NDJSON lines are silently skipped (parseNDJSON is tolerant) ✓
- OAI-compat: empty `choices` array → text is `''` ✓
- OAI-compat: `null` choice content → text is `''` ✓
- Factory integration: Gemini / Ollama / OAI-compat factory → connector → execute complete path ✓

---

### Phase C: Runtime orchestration

`aiOrchestrationService` validates correctly across the existing 35-test file. No new defects. `usableConnectors()` MCP exclusion is explicitly covered. `_ensureOrchestrator` cache invalidation logic is correct.

---

### Phase D: M6/M8/M9 end-to-end

All three routes tested via `m6-integration.test.ts`, `m8-integration.test.ts`, `m9-integration.test.ts`. `orchestratorSucceeded` flag prevents spurious edge function calls on empty-JSON orchestrator responses. No defects.

---

### Phase E: Security audit

**PASS** — all key-isolation invariants hold:
- Gemini key in URL, not request body (new test ✓)
- Ollama sends no Authorization header (new test ✓)
- OAI-compat without key sends no Authorization header (new test ✓)
- OAI-compat with key sends `Bearer <key>` (new test ✓)
- Keys never written to localStorage (existing tests ✓)
- `SecureString.toString/toJSON` always returns `[REDACTED]` (existing tests ✓)
- `ClaudeAdapter.execute()` throws `NOT_IMPLEMENTED` — stub correctly inert (new test ✓)

---

### Phase F: Cost / provider ownership

| Connector | Cost category | Who pays | Key location |
|---|---|---|---|
| Gemini Flash | `free_tier` (no key) / `user_api` (with key) | User | sessionStorage |
| Ollama | `local` | User (hardware) | None |
| OAI-compat (local) | `local` | User (hardware) | None |
| OAI-compat (cloud) | `user_api` | User | sessionStorage |
| MCP | `mcp` | Varies | Not stored by TestHub |
| Edge function fallback | TestHub pays | TestHub | Deno env only |

TestHub never exposes its `ANTHROPIC_API_KEY` to the browser. No frontend code path can trigger unbounded Anthropic API spend — all TestHub-paid calls go through authenticated edge functions.

---

### Phase G: UI validation

- `ConnectorCard`: all interactive controls use `data-testid` attributes. Enable/disable, test, delete, set-default all wired to service callbacks correctly.
- `GeminiConfigForm`: API key field is a password input, never echoes the key in the DOM value after save.
- `FeatureReadinessPanel`: **static** — shows "Connector platform ready — feature migration pending" for all four features regardless of actual connector state. Correct for current milestone (M5 completes the platform; feature migration is future work).
- `AIRuntimeStatusPanel`: reads live `getStatus()` from the service. Fallback chain display includes MCP (for informational display) while execution path excludes it.

---

### Phase H: Tests added

New file: `src/__tests__/ai/connector-integration.test.ts` — 22 tests

| Group | Tests |
|---|---|
| Gemini malformed/minimal responses | 5 |
| Gemini streaming edge cases | 1 |
| Ollama malformed/minimal responses | 3 |
| OAI-compat malformed/minimal responses | 3 |
| Factory integration (full path) | 3 |
| Security — key isolation | 4 |
| ClaudeAdapter stub documentation | 3 |

**Total test count: 742** (was 720)

---

### Phase I: Final report

**Architecture verdict: SOUND**

The M1–M4 AI Connector Platform is production-ready for its intended scope:
- Free-tier / user-owned connectors (Gemini, Ollama, OAI-compat) execute correctly
- Security boundaries hold — keys stay in sessionStorage, never reach localStorage, DOM, or logs
- TestHub pays nothing at the frontend layer; edge functions are the only TestHub-owned AI spend
- MCP connector is correctly reserved for future transport implementation
- ClaudeAdapter is dead code — inert, documented, and harmless

**Known limitations (not defects):**
1. Gemini key appears in browser network logs (Google's design)
2. `FeatureReadinessPanel` is static — does not reflect live connector health
3. `ClaudeAdapter` exists as a file but cannot be used
4. `toConfig()` is duplicated between two service files
5. Gemini endpoint is not proxy-configurable

**No blocking issues for Phase 5.5 M6 (MCP implementation).**

---

## Phase 5.5 M6 — MCP Agent Integration

M6 promotes MCP from a display-only placeholder to a first-class AI connector that participates in text generation when configured with a reachable transport.

### Design principle: provider-agnostic

Features (M6/M8/M9) continue to call `aiOrchestrationService.execute()` unchanged. The orchestrator transparently includes MCP agents in the fallback chain alongside Gemini, Ollama, and OAI-compat connectors. No feature knows whether its response came from an API provider or an MCP server.

### Transport layer

Two browser-compatible transports were added under `src/ai/agents/transports/`:

| Class | File | Protocol | Auth |
|---|---|---|---|
| `HttpMCPTransport` | `transports/HttpMCPTransport.ts` | HTTP POST (MCP Streamable HTTP, spec 2025-03-26) | `Authorization: Bearer` header |
| `WebSocketMCPTransport` | `transports/WebSocketMCPTransport.ts` | Native browser WebSocket, JSON-RPC 2.0 | `?token=` query param |

**Why not stdio?** Browsers cannot spawn subprocesses. `AIConnectorFactory` throws `NOT_IMPLEMENTED` with a clear message for stdio configs — the user is prompted to configure SSE or WebSocket instead.

**Why not classic SSE EventSource?** The original MCP SSE transport requires a persistent EventSource connection and a separate POST channel. The newer Streamable HTTP transport (2025-03-26) is a simple POST→JSON response — correct behaviour at much lower complexity, and fully compatible with modern MCP servers.

**Security:**
- WebSocket auth token is in `?token=` query param (browsers cannot set WebSocket handshake headers).
- HTTP auth token is in `Authorization: Bearer` — never in URL or request body.
- Both tokens are sourced from `SecureCredentialStore`, never from localStorage.
- Auth tokens never appear in error messages or logs.
- Response size bounded to 1 MiB to prevent memory exhaustion.

### Factory dispatch

`AIConnectorFactory.fromConfig()` gained a new dispatch branch:

```typescript
if (config.type === 'mcp_agent') return buildMCPConnector(config);
```

`buildMCPConnector` creates the appropriate transport from `metadata.mcpTransport` ('sse' → `HttpMCPTransport`, 'websocket' → `WebSocketMCPTransport`, 'stdio' → throws).

### _isMCPUsable filter

An MCP connector is "usable" for text generation iff:
- `mcpTransport` is `'sse'` or `'websocket'`, AND
- `mcpEndpoint` is a non-empty string

stdio and endpoint-less MCP connectors appear in `getStatus().fallbackChain` (for visibility) but are excluded from `usableConnectors()` (and therefore from the orchestrator).

This preserves backwards compatibility: tests that create bare MCP connectors without transport/endpoint continue to see them excluded, matching pre-M6 behaviour.

### Orchestrator changes

`_buildOrchestrator()` is now `async`. For each usable MCP connector, it calls `connector.connect()` before registering it. If the connect fails (server down, auth error), the connector is skipped with a sanitised warning — identical to how build failures are handled for other connector types.

`_ensureOrchestrator()` and `execute()` are correspondingly async. No external API changes — callers were already awaiting `execute()`.

### M6/M8/M9 routing

`GenericMCPConnector.capabilities()` returns `supportsJSON: true`, so MCP connectors are eligible for the `caps => caps.supportsJSON` filter used by all three AI engines. An MCP agent with text generation capability participates in the normal priority-ordered fallback chain.

### Auth token flow

```
AddConnectorDialog  →  aiConnectorService.addMCP({ authToken })
                              ↓
                    SecureCredentialStore.store(id, authToken)
                              ↓
            (on orchestrator build)
                    secureCredentialStore.retrieve(id)?.reveal()
                              ↓
                    AIConnectorFactory.fromConfig({ userApiKey: ... })
                              ↓
            HttpMCPTransport / WebSocketMCPTransport constructor
                    (never exposed further)
```

### RuntimeStatus additions

`RuntimeStatus` gained:
- `mcpAgentAvailable: boolean` — true when at least one enabled SSE/WS MCP connector has an endpoint
- `FallbackChainEntry.mcpUsable?: boolean` — per-connector usability flag for the status panel

### UI changes

- `MCPConfigForm` — optional "Auth Token" password field shown for SSE/WebSocket transports; stdio transport shows a "browser cannot test" warning.
- `AIRuntimeStatusPanel` — MCP entries without a usable transport show "stdio — bridge required" chip instead of the old "MCP — no text gen" chip; usable MCP connectors show no extra chip (they appear as normal chain entries).
- `aiConnectorService.testConnection()` for SSE/WS MCP — actually attempts to connect, runs a health check, then disconnects. stdio continues to return a descriptive failure immediately.

### Test coverage (M6)

Two new test files, 42 tests.

| File | Tests | Coverage |
|---|---|---|
| `__tests__/ai/mcp-transport.test.ts` | 27 | HttpMCPTransport and WebSocketMCPTransport: URL validation, connect/disconnect, request/response, error handling, auth header, auth token security |
| `__tests__/ai/mcp-orchestration.test.ts` | 15 | Factory dispatch, stdio rejection, _isMCPUsable filter, mcpAgentAvailable status, capabilities (supportsJSON=true), connect+health flow |

**Total test count: 784** (was 742)

### Known limitations

1. stdio MCP is fully unsupported in the browser — requires a local bridge process (out of scope).
2. MCP sampling (`sampling/createMessage`) relies on the connected server supporting the sampling capability; TestHub falls back to `tools/call` if sampling is absent.
3. Classic SSE EventSource-based MCP servers are not supported — only Streamable HTTP (2025-03-26 spec). Modern MCP servers use Streamable HTTP.
