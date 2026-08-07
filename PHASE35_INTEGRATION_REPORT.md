# Phase 3.5 — Integration Report
**Date:** 2026-08-07

---

## 1. Recorder Compatibility Assessment

The Recorder is planned for Phase 4. This report assesses readiness based on the frozen V5 interface contracts.

### 1.1 Execution Request Interface
The Recorder will need to produce `ExecutionRequest` objects. The shape is stable:

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

interface ExecutionStep {
  stepId:     string;
  stepNumber: number;
  action:     AutomationConfig;  // { driver_id: string; action: string }
  timeout_ms?: number;
}
```

The Recorder must emit `action.driver_id` matching a registered driver ID and `action.action` matching one of the driver's capability strings.

### 1.2 Driver Capabilities
MockDriver capabilities (used in all Phase 3.5 tests):
`['tap', 'swipe', 'type_text', 'press_key', 'press_back', 'screenshot']`

AndroidDriver and ChromeDriver will expose the same interface. The Recorder must produce action names from this set for the target driver type.

### 1.3 Evidence Collection
The Recorder does not interact with `EvidenceManager` directly. Evidence is collected by the execution-agent during step execution. No Recorder changes needed.

### 1.4 Event Observation
The Recorder may observe execution events through the `RecordingExecutionEventEmitter` `.events` array (field `.kind`, not `.type`). Available kinds: `ExecutionStarted`, `StepIntended`, `StepCompleted`, `StepFailed`, `ExecutionCompleted`, `ExecutionFailed`, `ExecutionCancelled`.

---

## 2. TestHub Web App ↔ execution-agent Integration

The M9 `agentStore` (Zustand) exposes command stubs that match `AgentServer` command types exactly:
- `executeTest(request)` → `ExecuteTest` command
- `cancelExecution(sessionId)` → `CancelExecution` command
- `getDeviceList()` → `GetDeviceList` command

Phase 4 wiring: replace stub implementations with `AgentServer.sendCommand()` calls. The interface contract is already aligned — this is a single integration point.

---

## 3. Supabase Evidence Backend

Current: `InMemoryArtifactStore`  
Planned: Supabase Storage adapter implementing `IArtifactStore`

Interface:
```typescript
interface IArtifactStore {
  put(path: string, data: Buffer, mimeType: string): Promise<void>;
}
```

The adapter must call `supabase.storage.from(bucket).upload(path, data, { contentType: mimeType })`. No changes to `EvidenceUploader` or `EvidenceManager` are required.

---

## 4. WebSocket Transport Wiring

Current: `ManualTransportFactory` in all tests  
Planned: `WS_TRANSPORT_FACTORY` connecting to production TestHub WebSocket endpoint

The transport abstraction (`ITransport`) is frozen. Production wiring replaces the factory only — no changes to `AgentServer`, command routing, reconnect logic, or heartbeat.

---

## 5. Integration Readiness Summary

| Integration Point | Interface Frozen | Phase 4 Work |
|-------------------|-----------------|--------------|
| Recorder → ExecutionRequest | ✅ | Build Recorder to emit correct step shape |
| agentStore → AgentServer | ✅ | Replace stubs with sendCommand() |
| EvidenceUploader → Supabase | ✅ | Write IArtifactStore adapter |
| ManualTransport → WebSocket | ✅ | Swap transport factory |
| Auth token provisioning | ❌ | Implement token exchange |
