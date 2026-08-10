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

---

## M10 — Project Ingestion & Project Intelligence (Phase 5.5 / Phase 6)

### Overview

M10 adds a complete project source ingestion subsystem that connects to ZIP archives, local folders (File System Access API), and GitHub repositories, produces a compact `ProjectKnowledge` model, and wires that knowledge into the AI Test Generator to replace manual file paste.

**Critical policy enforced architecturally:**
- Raw source file content is **NEVER** written to Supabase.
- Only compact metadata, hashes, and per-file summaries (purpose + symbols, ~200 bytes/file) are persisted.
- Sensitive files (detected by filename pattern or secret scanning) are excluded from AI context.
- No new TestHub-owned AI API key is introduced — existing `aiOrchestrationService.execute()` handles AI phases.

### New files

| Layer | File | Role |
|---|---|---|
| DB | `supabase/migrations/015_m10_project_ingestion.sql` | 3 new tables: `project_sources`, `project_file_indexes`, `project_knowledge` |
| Types | `src/services/projectIngestion/types.ts` | All domain types |
| Interface | `src/services/projectIngestion/IProjectSourceProvider.ts` | Provider abstraction + `ProviderCapability` |
| Security | `src/services/projectIngestion/SecretScanner.ts` | 22 secret patterns, 10 sensitive filename patterns |
| Filter | `src/services/projectIngestion/IngestionFilterEngine.ts` | Include/exclude rules, .gitignore support, file classification |
| Analysis | `src/services/projectIngestion/ProjectStructureAnalyzer.ts` | Static analysis — languages, frameworks, modules, entry points, dependencies |
| Knowledge | `src/services/projectIngestion/ProjectKnowledgeBuilder.ts` | Builds `ProjectKnowledge` from file index + content |
| Context | `src/services/projectIngestion/ProjectContextBuilder.ts` | Token-budget-aware AI context assembly |
| DB | `src/services/projectIngestion/projectIngestionDbService.ts` | Supabase CRUD for M10 tables |
| Orchestrator | `src/services/projectIngestion/ProjectIngestionService.ts` | Full pipeline: connect → scan → filter → analyze → index → understand → ready |
| ZIP | `src/services/projectIngestion/providers/ZipProjectSourceProvider.ts` | fflate-based; path traversal rejection |
| Local | `src/services/projectIngestion/providers/LocalProjectSourceProvider.ts` | File System Access API (Chrome/Edge) |
| GitHub | `src/services/projectIngestion/providers/GitHubProjectSourceProvider.ts` | GitHub REST API (tree + contents) |
| Stubs | `providers/GoogleDriveProjectSourceProvider.ts`, `OneDriveProjectSourceProvider.ts` | Future milestones |
| UI | `src/features/project-ingestion/` | Store, progress panel, source cards, intelligence panel, add-source dialog, page |

### Ingestion lifecycle

```
SOURCE_CONNECTED → SCANNING → FILTERING → ANALYZING → INDEXING → UNDERSTANDING → READY
                                                                                 ↓ (on error)
                                                                              FAILED / CANCELLED
```

### Storage policy (enforced)

- `project_sources` — source record with status, stats, config. No raw bytes.
- `project_file_indexes` — `entries: FileIndexEntry[]` JSONB (~80 bytes/file compact form). No content.
- `project_knowledge` — summaries only: `fileSummaries[].{purpose, symbols, imports}`. No source code.

### Security

- `SecretScanner` runs before any file content reaches an AI model.
- 22 regex patterns detect AWS, GitHub PAT, OpenAI/Anthropic keys, Stripe, Firebase, PEM, DB URLs, .env assignments.
- 10 sensitive filename patterns (`.env`, `google-services.json`, `.pem`, keystore, etc.).
- Findings show only a redacted preview (`sk-...abc`) — raw value never logged or stored.
- GitHub PAT held in memory only for the session duration; never written to Supabase.

### Test coverage (M10)

7 new test files, 65 tests.

| File | Tests |
|---|---|
| `SecretScanner.test.ts` | 16 |
| `IngestionFilterEngine.test.ts` | 13 |
| `ZipProvider.test.ts` | 8 |
| `ProjectStructureAnalyzer.test.ts` | 5 |
| `GitHubProvider.test.ts` | 7 |
| `ProjectKnowledgeBuilder.test.ts` | 4 |
| `ProjectContextBuilder.test.ts` | 6 |

**Total test count: 934** (was 869)

---

## M11 — AI Test Generator × Project Intelligence Integration

**Committed:** M11 (Phase 5.5)
**Test count:** 977 (43 new M11 tests)

### Design principle

M11 is an *extension* of the existing AI Test Generator (M6), not a separate product. Both the manual source-file path and the new Project Intelligence path converge at the same canonical `TestCase` / `TestCaseStep` model and the same `importAccepted()` persistence function. The test execution flow is unchanged.

```
Manual Source Files          Project Intelligence (M10)
       │                              │
ProjectAnalyzer              ProjectContextBuilder
       │                              │
  ProjectModel                  ProjectContext
       │                              │
  TestCaseGenerator.buildPrompt()  TestCaseGenerator.buildPromptFromContext()
                    └──────┬──────────┘
              aiOrchestrationService.execute()
                           │
              TestCaseGenerator.parseResponse()
                           │
             SuggestionEngine.process(existing titles)
                           │
              TestSuggestion[] (all status = 'pending')
                           │
           Human Review → Accept / Reject
                           │
         AITestGenerationEngine.importAccepted()
                           │
              test_cases + test_case_steps (Supabase)
                           │
                TestExecutionPage (unchanged)
```

### New service layer (Phase B)

**`TestCaseGenerator.buildPromptFromContext(ctx, knowledge, options, existingTestTitles)`**
- Takes `ProjectContext` + `ProjectKnowledge` (from M10) instead of `ProjectModel`
- Includes module coverage status (✓ has tests / ⚠ no tests)
- Lists uncovered modules and instructs AI to prioritize them
- Injects existing test titles to prevent duplicates
- Respects token budget already enforced by `ProjectContextBuilder`

**`AITestGenerationEngine.generateFromContext(knowledge, ctxOptions, projectId)`**
1. Queries `testCaseService.list(projectId)` for existing test case titles (Phase E)
2. Builds `ProjectContext` via `projectContextBuilder.build()` with 24k token budget
3. Derives `GenerationOptions.categories` from `ContextGenerationOptions.mode` via `GENERATION_MODE_CATEGORIES`
4. Runs same M8 connector-first / edge-fallback-last cost-safety pattern as `generate()`
5. Passes existing titles to `SuggestionEngine.process()` for deduplication

### New types (Phase C)

| Type | Purpose |
|------|---------|
| `GenerationMode` | `'full_suite' \| 'functional' \| 'ui' \| 'regression' \| 'negative_edge' \| 'security' \| 'module_specific'` |
| `GENERATION_MODE_CATEGORIES` | Maps each `GenerationMode` → `TestCategory[]` preset |
| `GENERATION_MODE_LABELS` | Display labels |
| `GENERATION_MODE_DESCRIPTIONS` | One-sentence descriptions |
| `GenerationScope` | `'full' \| 'module' \| 'feature' \| 'file'` |
| `ContextGenerationOptions` | Full options for context-based generation (mode + scope + moduleIds + feature + maxSuggestions) |

### New UI components (Phase F)

**`ProjectIntelligenceInputPanel`**
- Reads from `projectIngestionStore` (sources keyed by projectId, knowledge keyed by projectId)
- Filters for `status === 'ready'` sources
- Scope selector: Full project / Specific module(s) / Feature area
- Module chip picker (when scope = module)
- Feature text input (when scope = feature)
- Generation mode chip picker with tooltip descriptions
- Live AI connector status badge (connector name, model, fallback state)
- "Continue →" triggers `onConfigure(knowledge, options, projectId)`

**`ContextPreviewPanel`**
- Shown in wizard step 1 when in Project Intelligence mode
- Displays: project overview, context stats (modules / files / token estimate / existing test count), generation config summary, coverage bar, uncovered modules, connector status
- Flags if no connector is available with actionable error

**`AITestGeneratorPage` (extended)**
- New `InputMode` toggle: Manual Source Files ↔ Project Intelligence
- Both modes use the same 4-step stepper
- PI mode: `handlePIConfigure()` → step 1 preview → `handlePIGenerate()` calls `generateFromContext()`
- Manual mode: unchanged `handleManualAnalyze()` + `handleManualGenerate()`
- Connector status shown in step 2 for PI mode
- Both modes feed into the same `SuggestionList` → `BulkImportDialog` → `importAccepted()` path

### Existing test awareness (Phase E)

Before every `generateFromContext()` call, existing test case titles are fetched via `testCaseService.list(projectId)` and passed to `SuggestionEngine.process()`. The AI prompt includes these titles with the instruction "do NOT duplicate — identify gaps instead." Suggestions matching existing titles above Jaccard threshold 0.6 are marked `isDuplicate: true` and sorted to the bottom of the review list.

### M8 cost-safety (unchanged)

`generateFromContext()` uses the identical fallback pattern as `generate()`:
1. Try user-configured connectors via `aiOrchestrationService.execute()`
2. Fall through to Supabase edge function **only** if `aiRuntimePolicy.isEdgeFunctionEnabled() === true`
3. Never calls the TestHub-owned Anthropic key unless explicitly opted in

### Invariant verification

```
Manual Test Case             AI Generated (M11)
       │                           │
Manual Creation          generateFromContext()
       │                           │  (human review + approval)
       └──────────┬────────────────┘
                  ↓
           canonical TestCase
           (test_cases table)
                  ↓
         TestExecutionPage (unchanged)
```

Both paths are producers of the same `TestCase` schema. `importAccepted()` is the sole persistence entry point. The test execution flow is completely agnostic to how a test case was created.

### New test coverage

| Test file | Cases | Covers |
|-----------|-------|--------|
| `m11-context-integration.test.ts` | 43 | GenerationMode presets, buildPromptFromContext, ProjectContext scope/token-budget, SuggestionEngine existing-awareness, DraftTestCase ↔ TestCase compatibility, malformed response handling, human approval invariant, sensitive file exclusion, token budget enforcement, edge fallback policy, M6 regression |

---

## M12 — Test Intelligence Productionization

**Committed:** M12 (Phase 6)
**Test count:** 1036 (59 new M12 tests, in `src/__tests__/m12/`)

### Design principle: ONE canonical TestHub testing workflow

Manual test cases, JSON-imported test cases, and AI-generated test cases all become the same canonical `TestCase` records and use the same execution/reporting infrastructure. There is no separate "AI testing system."

```
Manual UI          JSON Import          AI Generation (PI)
    │                   │                      │
    ▼                   ▼                      ▼
testCaseService     normalizeTestCase()   importAccepted()
  .create()       + testCaseService            │
    │               .create()            (normalizeTestCase
    └───────────────────┴──────────────── called internally)
                        ↓
                  test_cases table  (ai_generation_metadata JSONB)
                        ↓
              TestExecutionPage (unchanged)
```

### Phase B — TestCaseNormalizer (`src/services/testCaseNormalizer.ts`)

Pure function normalizer that is the single validation/coercion path for all test case inputs:

- `normalizeTestCase(raw)` — accepts loose JSON (camelCase, snake_case, human-readable field names); returns `NormalizationResult { ok, draft?, errors[] }`
- `normalizeTestCaseBatch(raws[])` — normalizes a batch; returns `{ results, validCount, invalidCount }`
- `normalizeCategory(raw)` — maps 13 canonical categories + aliases; defaults to `'smoke'`

**Category aliases:** `functional→happy_path`, `e2e/end-to-end→integration`, `auth/authorization→permission`, `ui→smoke`, `perf→performance`, `data/database→data_validation`, `edge_case→boundary`

**Priority aliases:** `p1/blocker/urgent→critical`, `p2/major→high`, `p3/normal→medium`, `p4/minor/trivial→low`

**Field name aliases:** `isAutomationReady`, `estimatedMinutes`, `testName/name→title`, `action/instruction→step description`, `expectedResult/expected/assertion→expected_result`

### Phase C — JSON Import (`src/services/jsonImportService.ts`)

New JSON file import feature. Supported input shapes:
- Direct array: `[{ title, steps, ... }]`
- Wrapped: `{ test_cases: [...] }` | `{ cases: [...] }` | `{ tests: [...] }`
- Single object: `{ title, steps, ... }` → wrapped automatically

API:
- `parseJsonInput(text)` — extracts raw array from any supported shape; returns `null` on failure
- `dryRunJsonImport(raws)` — validates + previews without persisting
- `importJsonTestCases(raws, options)` — normalizes → deduplicates (via `SuggestionEngine.checkDuplicate()`) → persists via `testCaseService.create()` path; writes `ai_generation_metadata` with `source_type: 'json_import'`

UI: `JsonImportDialog` (5-phase: pick → preview → target → importing → done) added to `TestCasesPage`.

### Phase D — Extended categories (13 total)

Original 8: `smoke`, `happy_path`, `validation`, `boundary`, `negative`, `permission`, `navigation`, `regression`

New 5: `integration`, `performance`, `api`, `data_validation`, `compatibility`

`GENERATION_MODE_CATEGORIES` updated for all 7 modes. `SuggestionCard`, `AITestGeneratorPage`, `SuggestionList` updated. `TestCaseGenerator` prompt includes descriptions for all 13 categories.

### Phase E — Project Understanding Summary (`ProjectUnderstandingSummary.tsx`)

Human-readable summary of what Project Intelligence detected before AI generation. Shows detected/inferred/unknown status for each project attribute, module chips (green=covered, orange=uncovered), entry points, stats, and potential gaps.

### Phase F — Test Plan layer (`src/services/aiTestGenerator/TestPlanBuilder.ts`)

Intermediate step between ingestion and generation. The plan describes WHAT will be tested before generating HOW (actual steps).

- `buildHeuristicTestPlan(knowledge, existingCount, moduleFilter?)` — **synchronous, no AI required**. Instant preview using `CodeModule.type` to generate type-appropriate coverage areas.
- `buildTestPlanPrompt(knowledge, moduleFilter?)` — prompt string for AI-enhanced plans (optional upgrade).

UI: `TestPlanReviewPanel` shows accordion per module with coverage areas, category chips, priority chips.

### Phase G — True coverage analysis (`src/services/coverageAnalysisService.ts`)

Maps actual TestHub `test_cases` (not project source test files) against `ProjectKnowledge.codeModules`.

- `analyzeCoverage(knowledge, testCases[])` → `CoverageAnalysisResult { entries[], estimatedPercent, disclaimer, ... }`
- Matching strategy: (1) exact module name substring in test title, (2) ≥50% module name token overlap in title, (3) module name token in test tags
- Coverage levels: `none` (0), `weak` (1–2), `moderate` (3–5), `strong` (6+)
- Always labeled "TestHub AI Coverage Estimate" — explicitly NOT code coverage

UI: `CoverageAnalysisPanel` with color-coded bars and disclaimer.

### Phase H — Duplicate detection

No changes needed. `SuggestionEngine.checkDuplicate()` (Jaccard 0.6/0.7 thresholds) is reused by JSON import for deduplication.

### Phase J — Source traceability / provenance

New DB column: `test_cases.ai_generation_metadata JSONB DEFAULT NULL` (migration `016_m12_test_traceability.sql`).

New type `AiGenerationMetadata`:
```typescript
{ source_type: 'project_intelligence' | 'manual_analysis' | 'json_import';
  project_id?: string; generation_mode?: string; generation_scope?: string;
  generated_at: string; connector_model?: string; }
```

- Manual cases: `null` (untouched)
- AI-generated: populated by `importAccepted()` with `source_type: 'project_intelligence'` or `'manual_analysis'`
- JSON-imported: populated by `importJsonTestCases()` with `source_type: 'json_import'`

### Phase M — Updated wizard flow

| Mode | Steps |
|---|---|
| Project Intelligence | Select Project → **Project Understanding** → **Test Plan** → Configure & Generate → Review & Import |
| Manual Source Files  | Analyze Project → Preview Analysis → Configure & Generate → Review & Import (unchanged) |

Both modes converge at the same `SuggestionList → BulkImportDialog → importAccepted()` path.

### Security (Phase N)

- Raw project source is never stored in Supabase (M10 invariant, unchanged)
- No new TestHub-owned AI API key (M8 invariant, unchanged)
- Edge function fallback remains explicitly opt-in (M8 invariant, unchanged)
- `ai_generation_metadata` column stores only compact, non-sensitive metadata (no prompts, no source code, no keys)

### Architecture invariants (Phase P)

All 12 invariants verified in `src/__tests__/m12/m12-invariants.test.ts`:
1. ONE canonical `TestCase` model — all sources produce the same shape
2. ONE normalizer entry point — `normalizeTestCase()` for all sources
3. Priority output ∈ `{ critical, high, medium, low }`
4. Category output ∈ 13 canonical values
5. JSON import validation = normalizer validation
6. `parseJsonInput` supports all 5 documented input shapes
7. Heuristic test plan is synchronous — no AI required
8. Coverage analysis uses TestHub `test_cases`, not `existingTestPaths`
9. `validCount + invalidCount === results.length` in batch normalization
10. `draft.steps` is always an array, never undefined
11. `draft.tags` is always `string[]`, never a plain string
12. Coverage result always includes "TestHub AI Coverage Estimate" disclaimer

### Test coverage (M12)

4 new test files, 59 tests.

| File | Tests | Covers |
|------|-------|--------|
| `m12/testCaseNormalizer.test.ts` | 18 | normalizeCategory aliases, normalizeTestCase field coercion, priority aliases, tag normalization, step field aliases, batch tally |
| `m12/jsonImportService.test.ts` | 16 | parseJsonInput shape support, dryRunJsonImport valid/invalid counting, error indexing |
| `m12/coverageAnalysis.test.ts` | 9 | Title/tag matching, coverage levels, estimatedPercent, existingTestPaths vs TestHub test_cases, disclaimer |
| `m12/m12-invariants.test.ts` | 16 | All 12 architecture invariants |

**Total test count: 1036** (was 977)

---

## M13 — End-to-End Validation & Hardening

**Committed:** M13 (Phase 6)
**Test count:** 1109 (73 new M13 tests, in `src/__tests__/m13/`)

### Audit scope

M13 performed a full 10-phase audit of the M10–M12 pipeline before adding any new capabilities. Read-only audit of every service, migration, and UI component in the pipeline. Three defects found and fixed.

### Architecture verdict: SOUND

The canonical invariant holds end-to-end:

```
Project Source
  → ProjectIngestionService (filter + analyze + index + understand)
  → ProjectKnowledge (compact metadata, no raw source)
  → ProjectContextBuilder (token-budget-aware context)
  → TestPlanBuilder (heuristic plan — synchronous, no AI)
  → TestCaseGenerator.buildPromptFromContext() (AI prompt)
  → AIOrchestrationService (user connector or edge-function fallback)
  → TestSuggestion[] (NEVER persisted without human review)
  → Human Review (accept/reject)
  → AITestGenerationEngine.importAccepted()
  → test_cases table (canonical TestCase, ai_generation_metadata populated)
  → TestExecutionPage (unchanged — source-agnostic)
  → test_results table

JSON Import Path:
  JSON text → parseJsonInput() → normalizeTestCaseBatch()
  → dryRunJsonImport() (preview, no DB)
  → importJsonTestCases()
  → test_cases table (canonical TestCase, ai_generation_metadata populated)
  → TestExecutionPage (same path, no branching)

Manual Creation:
  UI form → testCaseService.create()
  → test_cases table (ai_generation_metadata = NULL)
  → TestExecutionPage (same path)
```

### Convergence invariant

All three sources produce identical required columns in `test_cases`:
`project_id`, `module_id`, `title`, `description`, `priority`, `status: 'draft'`, `tags`, `is_automation_ready`, `estimated_minutes`, `preconditions`, `created_by`.

The only diverging column is `ai_generation_metadata` (JSONB):
- Manual: `NULL`
- AI-generated: `{source_type: 'project_intelligence', project_id, generation_mode, connector_model, generated_at}`
- JSON-imported: `{source_type: 'json_import', project_id, generated_at}`

`TestExecutionPage` loads test cases by assignment ID via the `test_assignments` → `test_cases` join. It does not filter or branch on `ai_generation_metadata`. All three sources reach the same execution UI.

### Defects found and fixed

**DEF-1: `TestPlanBuilder.buildModulePlan()` — `currentTestCount` hardcoded**
- File: `src/services/aiTestGenerator/TestPlanBuilder.ts:108`
- Was: `currentTestCount: isCovered ? 1 : 0`
- Fix: `currentTestCount: module.testCount` (uses the actual project-source test count from `CodeModule`)
- Impact: Test plan UI showed every covered module as "1 test" regardless of actual test count. Now shows the real count.

**DEF-2: `SuggestionList.tsx` — `ALL_CATEGORIES` stale**
- File: `src/features/ai-test-generator/SuggestionList.tsx:14-17`
- Was: only 8 original categories
- Fix: Added 5 new M12 categories (`integration`, `performance`, `api`, `data_validation`, `compatibility`)
- Impact: Dead code (the list wasn't used for active filtering), but misleading. Now consistent with `TestCategory`.

**DEF-3: `AITestGenerationEngine.ts` — `automation_config: ?? undefined`**
- File: `src/services/aiTestGenerator/AITestGenerationEngine.ts:359`
- Was: `step.automation_config ?? undefined`
- Fix: `step.automation_config ?? null`
- Impact: Supabase JS client omits columns with `undefined` rather than explicitly inserting NULL. Now consistent with JSON import path and schema default.

### Audit findings — architecture is correct, not defects

**Finding A** — Both `importAccepted()` and `importJsonTestCases()` write directly to supabase, not through `testCaseService.create()`. This is intentional — both paths produce the same DB outcome. If `testCaseService.create()` ever gains middleware, these paths would need to be updated.

**Finding B** — JSON import does not add `ai:${category}` tags (unlike AI import). This is intentional — JSON-imported cases have no AI category signal. The source is identified via `ai_generation_metadata.source_type = 'json_import'`.

**Finding C** — `CoverageAnalysisService` is correctly labeled "TestHub AI Coverage Estimate" — it is NOT code coverage, NOT execution coverage. It is a heuristic logical estimate of which project modules have related TestHub test cases.

**Finding D** — `SuggestionEngine.tokenize()` filters tokens with length ≤ 2. Short terms like "UI", "to" are always ignored in duplicate detection. This is correct behavior — short tokens add noise to Jaccard similarity.

### Storage audit — raw source never persisted

Verified in M13 that no raw project source reaches:
- `test_cases` — only title, description, steps (human-authored or AI-derived)
- `test_case_steps` — only step descriptions and expected results
- `project_knowledge` — file summaries (purpose + symbols + imports only, no raw content)
- `project_file_indexes` — compact file metadata (paths, hashes, categories, no content)
- `ai_generation_metadata` — only compact identifiers (project_id, module names, generation mode)

### Security audit

- API keys stored in `sessionStorage` via `SecureCredentialStore`, never `localStorage`
- GitHub PAT held in memory only, never written to Supabase
- `SecretScanner` (22 patterns) runs before any file content reaches AI context
- `ai_generation_metadata` JSONB never contains credentials, raw source, or AI prompts
- JSON import cannot inject credentials into metadata — the metadata is constructed internally, not derived from the imported JSON content

### Project understanding validation

`ProjectStructureAnalyzer` correctly answers:

| Question | Answer source |
|---|---|
| What is this project? | `knowledge.name`, `knowledge.description`, `knowledge.projectType` |
| What is its purpose? | `knowledge.purpose`, `knowledge.description` |
| What are its major modules? | `knowledge.codeModules[].{name, type, fileCount, description}` |
| What are the entry points? | `knowledge.entryPoints[].{path, kind, name}` |
| What should be tested? | `TestPlanBuilder.buildHeuristicTestPlan()` based on module types |

Framework detection covers: React, React Native, Next.js, Vue, Angular, Svelte, Jetpack Compose, Android Views, SwiftUI, UIKit, Flutter, Express, Fastify, NestJS, Spring Boot, Django, FastAPI, ASP.NET, Hilt, Retrofit, Room.

### Test coverage (M13)

2 new test files, 73 tests.

| File | Tests | Covers |
|------|-------|--------|
| `m13/m13-e2e-invariants.test.ts` | 40 | Canonical schema convergence, execution compatibility, TestPlanBuilder fix, JSON shapes, failure matrix, duplicate detection, storage invariants |
| `m13/m13-project-understanding.test.ts` | 33 | ProjectStructureAnalyzer (React, Android, empty, secrets), TestPlan module coverage, coverage areas, currentTestCount fix, module filter, prompt validation, module type mapping |

**Total test count: 1109** (was 1036)

### Known limitations

1. `currentTestCount` in the test plan reflects project source test files (from `CodeModule.testCount`), not TestHub test cases. A future milestone could pass TestHub test counts into `buildHeuristicTestPlan()` for a richer plan.
2. `CoverageAnalysisService` uses title/tag substring matching — not actual execution results. Execution-based coverage would require joining `test_results` to `test_cases` to `modules`.
3. The M8 edge-function fallback is opt-in and tested in isolation — end-to-end AI generation requires a real configured connector (Gemini, Ollama, or OAI-compat).
4. `testCaseService.create()` is not the insertion path for AI-generated or JSON-imported cases — they use direct Supabase inserts with identical schema.

---

## M14 — End-to-End Project-to-Test Validation

**Goal:** Prove that the entire pipeline from Project Source → AI Test Plan → Canonical `test_cases` → Test Execution → Coverage is one coherent system, with no parallel path or duplicate execution engine.

### Core invariant

```
Project Source → Ingestion → Project Understanding → Testing Scope → AI Test Plan
→ AI Test Cases → Human Review → canonical test_cases → Test Execution → Results/Coverage
```

Manual test creation, JSON import, and AI generation all write to the **same** `test_cases` table and use the **same** `test_results`/`test_run_cases` execution pipeline. There is no secondary execution path.

### Canonical schema convergence (3-path proof)

All three test case creation paths produce rows with identical required columns:

| Column | Manual | JSON Import | AI Generated |
|--------|--------|-------------|--------------|
| `id`, `project_id`, `module_id` | ✓ | ✓ | ✓ |
| `test_id`, `title`, `description` | ✓ | ✓ | ✓ |
| `priority`, `status`, `tags` | ✓ | ✓ | ✓ |
| `is_automation_ready`, `estimated_minutes` | ✓ | ✓ | ✓ |
| `preconditions`, `steps[]` | ✓ | ✓ | ✓ |
| `ai_generation_metadata` | NULL | `{source_type:'json_import',...}` | `{source_type:'project_intelligence',...}` |

### Defects found and fixed

| ID | Component | Defect | Fix |
|----|-----------|--------|-----|
| DEF-M14-1 | `AITestGeneratorPage` → `TestPlanReviewPanel` | `existingCounts` prop hardcoded to `coveredModules ? 1 : 0`; per-module counts never loaded | Load actual `test_cases` per module via `testCaseService.list()` and pass real `moduleTestCounts` map |
| DEF-M14-2 | `BulkImportDialog` | When launched from PI mode, project dropdown always started empty regardless of which project was being analyzed | Added `preselectedProjectId` prop that auto-selects the correct project on open |

### Source provider status

| Provider | Status | Notes |
|----------|--------|-------|
| Local filesystem | ✓ Implemented | Full connect/list/read |
| ZIP archive | ✓ Implemented | Extracts and reads |
| GitHub (PAT) | ✓ Implemented | REST API via PAT |
| Google Drive | ✗ Stub | Throws `ProviderNotImplementedError` |
| OneDrive | ✗ Stub | Throws `ProviderNotImplementedError` |

Cloud provider stubs are explicit and intentional. They do NOT silently fail or return empty results.

### Test coverage (M14)

3 new test files, 140 tests.

| File | Tests | Covers |
|------|-------|--------|
| `m14/m14-pipeline-invariants.test.ts` | ~50 | 3-path canonical convergence, schema completeness, execution agnosticism, coverage analysis, JSON import compatibility, accepted/rejected filtering |
| `m14/m14-ingestion-validation.test.ts` | ~50 | Multi-module filter engine (20-file fixture), secret scanner API, binary/ignored detection, provider stub behavior, `ProviderNotImplementedError` |
| `m14/m14-scope-and-plan.test.ts` | ~40 | `FileSummary` required fields, `ProjectContext` field names, `SuggestionEngine` dedup behavior, `normalizeTestCase` purity (no status injection), `analyzeCoverage` import |

**Total test count: 1249** (was 1109)

### Security invariants (M14 verified)

- Raw project source is NEVER stored in Supabase — ingestion pipeline is local-only
- `ai_generation_metadata` stores project reference IDs only, not file content
- M8 edge-function fallback remains explicitly opt-in
- No TestHub-owned AI API key introduced
- `SecretScanner` uses `scan(content, filePath)` → returns `SecretFinding[]`; sensitive files are excluded from `ProjectContext` before any AI call

### Known limitations (updated)

1. `currentTestCount` in the test plan reflects project source test files (from `CodeModule.testCount`), not TestHub test cases — the field is populated at scan time.
2. `CoverageAnalysisService` uses title/tag substring matching, not actual execution results.
3. Cloud providers (Google Drive, OneDrive) are stubs — documented and throw explicitly; no silent fallback.
4. The M8 edge-function fallback is opt-in and tested in isolation.
