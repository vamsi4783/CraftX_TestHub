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

- No API calls — stubs throw `NOT_IMPLEMENTED`.
- No UI — settings model only, no React components.
- No Supabase / edge function changes.
- No billing or key management logic.
- No changes to existing M6–M9 features.
