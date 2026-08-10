# Architecture Freeze Document — V5.0 (v1.0 Release)
**Date:** 2026-08-07  
**Freeze scope:** execution-agent public API + TestHub web app integration interface  
**Status:** FROZEN — no changes without a version increment

---

## 1. Frozen Interfaces

### 1.1 ExecutionEngine

```typescript
// Constructor — FROZEN
constructor(
  driverRegistry: DriverRegistry,
  emitter:        IExecutionEventEmitter,
  stepExecutor:   StepExecutor,
)

// Public method — FROZEN
execute(request: ExecutionRequest): Promise<ExecutionResult>
```

### 1.2 ExecutionRequest — FROZEN

```typescript
interface ExecutionRequest {
  sessionId:      string;
  testCaseId:     string;
  projectId:      string;
  organizationId: string;
  agentId:        string;
  driverId:       string;
  steps:          ExecutionStep[];
}
```

### 1.3 ExecutionStep — FROZEN

```typescript
interface ExecutionStep {
  stepId:      string;
  stepNumber:  number;
  action:      AutomationConfig;  // { driver_id: string; action: string }
  timeout_ms?: number;
}
```

### 1.4 DriverHost — FROZEN

```typescript
// Constructor — FROZEN
constructor(config: { defaultTimeout_ms: number })
```

### 1.5 MockDriver — FROZEN

```typescript
// Constructor — FROZEN
constructor(opts: {
  id:              string;
  kind?:           'android' | 'browser';
  executeResult?:  unknown | Error;
  executeDelay_ms?: number;
  capabilities?:   string[];
})
```

Default capabilities: `['tap', 'swipe', 'type_text', 'press_key', 'press_back', 'screenshot']`

### 1.6 EvidenceManager — FROZEN

```typescript
// Constructor — FROZEN
constructor(uploader: EvidenceUploader, metrics?: EvidenceMetricsHooks)

// Methods — FROZEN
collectScreenshot(screenshot: Buffer, evidenceType: EvidenceType, ctx: EvidenceCollectionContext): Promise<string>
collectLog(log: string | Buffer, evidenceType: EvidenceType, ctx: EvidenceCollectionContext): Promise<string>
upload(id: string): Promise<UploadResult>
retry(id: string): Promise<void>
uploadAll(): Promise<UploadResult[]>
```

### 1.7 EvidenceCollectionContext — FROZEN

```typescript
interface EvidenceCollectionContext {
  executionId:    string;
  stepId:         string;
  stepNumber:     number;
  sessionId:      string;
  organizationId: string;
  projectId:      string;
  device:         DeviceContext;
  app:            AppContext;
  driver:         DriverContext;
  stepStatus:     string;
  stepDuration_ms: number;
}
```

### 1.8 StoragePathBuilder — FROZEN

```typescript
buildStoragePath(params: {
  organizationId: string;
  projectId:      string;
  executionId:    string;
  stepId:         string;
  evidenceId:     string;
  mimeType:       string;
}): string
// Output pattern: {orgId}/{projectId}/{executionId}/{stepId}/{evidenceId}.{ext}
// No timestamps. No random components. Deterministic.
```

### 1.9 AgentRuntime — FROZEN

```typescript
// Constructor — FROZEN
constructor(config: RuntimeConfig, deps: AgentRuntimeDependencies)

// Methods — FROZEN
start(): Promise<void>
stop(): Promise<void>
fault(reason: string): void
status(): RuntimeStatus
collectHealth(activeExecutions: number, queueDepth: number): HealthReport
```

### 1.10 AgentConnectionManager — FROZEN

```typescript
// Constructor — FROZEN
constructor(policy?: Partial<ReconnectPolicy>)

// Methods — FROZEN
startConnecting(): void
markConnected(): void
onConnectionLost(): ReconnectDecision
markAuthFailed(reason: string): void
markDisconnected(): void

// Property — FROZEN
readonly state: ConnectionState
```

### 1.11 MessageSerializer — FROZEN

```typescript
// Methods — FROZEN
parse(raw: string): AgentMessage    // throws on unknown type or missing fields
serialize(msg: AgentMessage): string
```

### 1.12 Protocol Constants — FROZEN

```typescript
PROTOCOL_VERSION = '1.0'

DEFAULT_RECONNECT_POLICY = {
  maxAttempts:       10,
  initialDelayMs:    1_000,
  backoffMultiplier: 2,
  maxDelayMs:        30_000,
}
```

### 1.13 RecordingExecutionEventEmitter — FROZEN

```typescript
// Event shape — FROZEN
interface EmittedEvent {
  kind:      string;   // NOT 'type' — field is 'kind'
  payload:   unknown;
  ctx:       ExecutionContext;
  emittedAt: string;
}

readonly events: EmittedEvent[]
```

---

## 2. Architecture Layers (V5, 15 Layers, 10 Phases)

Layers 1–15 as defined in M1–M8 milestone specifications. All layers implemented, tested, and frozen. No layer additions or removals are permitted in Phase 4 without a V5 → V6 increment.

---

## 3. Versioning Policy

- **FROZEN** interfaces: no changes. Breaking changes require a new major version and approval.
- **OPEN** items (H1, H2, M1–M3): implementation work only, no interface changes.
- Phase 4 work must pass the existing 719-test regression suite on merge.

---

## 4. Freeze Effective Date

This document is effective as of the commit for Phase 3.5 validation (2026-08-07).  
Git tag: `v1.0-phase35-freeze`

---

## 5. M15 — End-to-End Workflow Refinement (2026-08-10)

**Milestone type:** Refinement (no new subsystems, no architecture changes)  
**Status:** Complete

### 5.1 Invariants preserved

All architecture invariants from the Phase 3.5 freeze are unchanged:

- Manual / JSON / AI-generated test cases all insert into `test_cases` and route through `TestExecutionPage`
- No separate AI execution engine introduced
- Raw project source is never stored in Supabase (in-memory only during ingestion)
- No TestHub-owned AI API key introduced
- Edge function fallback remains explicitly opt-in
- `SecureCredentialStore` remains the secret boundary
- Google Drive / OneDrive remain explicit stubs
- Sensitive files remain excluded from AI context

### 5.2 Changes shipped

| Area | Change | Files |
|---|---|---|
| DB | Applied `ai_generation_metadata` JSONB column (migration 016, P0 fix) | Supabase remote |
| ProjectIngestionPage | Project picker when no projectId in URL; post-ingestion CTA → AI Generator | `ProjectIngestionPage.tsx` |
| AITestGeneratorPage | `?project=` URL param auto-populates PI mode; disabled CTA opacity + Tooltip + Alert; post-import navigate to `/test-cases` | `AITestGeneratorPage.tsx` |
| ProjectDetailPage | Testing tab with action cards (Understand, Generate, Import, View, Run) | `ProjectDetailPage.tsx` |
| ProjectKnowledgeBuilder | Name extracted from `package.json`/`README.md` before falling back to project name | `ProjectKnowledgeBuilder.ts` |
| Tests | 9 new M15 unit tests; full suite: 1258 tests passing | `src/__tests__/m15/` |

### 5.3 Test count

- Pre-M15: 1249 tests (65 files)
- Post-M15: 1258 tests (66 files)
