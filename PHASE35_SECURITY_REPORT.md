# Phase 3.5 — Security Report
**Date:** 2026-08-07

---

## 1. Protocol Security

### 1.1 Message Injection Prevention
`MessageSerializer.parse()` validates every field before accepting a message:
- Unknown `type` fields are rejected with a thrown exception — no silent acceptance
- Missing `messageId` is rejected — every message must carry a correlation handle
- Validated live in `LiveIntegration.test.ts`: both cases confirmed ✅

### 1.2 Protocol Version Freeze
`PROTOCOL_VERSION = '1.0'` is a module-level constant. No runtime override path exists.  
Validated live: ✅ frozen at `'1.0'`

### 1.3 Auth Failure Containment
On `AuthenticationFailed` the connection manager transitions immediately to `AuthenticationFailed` state and does not re-enter the reconnect loop. Validated live: ✅

---

## 2. Evidence Security

### 2.1 Immutability
`EvidenceQueue` throws `EvidenceImmutabilityError` if the same evidence ID is enqueued twice.  
Status: ✅ confirmed in unit tests (milestone8)

### 2.2 Upload Idempotency
`EvidenceManager.upload(id)` on an already-uploaded item returns success without a second store write.  
Status: ✅ confirmed live in `LiveIntegration.test.ts`

### 2.3 Path Determinism (No Timing Side-Channels)
`StoragePathBuilder` generates paths from content IDs only — no Unix timestamps in the output.  
Pattern: `{orgId}/{projectId}/{executionId}/{stepId}/{evidenceId}.{ext}`  
Status: ✅ confirmed live

---

## 3. Reconnect Policy Freeze

`DEFAULT_RECONNECT_POLICY` values are module constants and cannot be overridden at runtime without re-importing the module:
- `maxAttempts: 10` — caps reconnect storms
- `initialDelayMs: 1_000` — prevents tight loops
- `backoffMultiplier: 2` — exponential backoff
- `maxDelayMs: 30_000` — caps maximum wait

Status: ✅ values frozen and validated live

---

## 4. Runtime Fault Containment

`AgentRuntime.fault(reason)` transitions to `Faulted` (a terminal state). No further state transitions are allowed. A second `fault()` call is a no-op — it does not overwrite the original fault reason and does not throw.  
Status: ✅ confirmed live

---

## 5. Secrets

No credentials, tokens, or keys are present in any test file, report, or committed file in this session. The Supabase auth token, device ADB serial, and project IDs remain confined to session context only.

---

## 6. Open Security Items

| Item | Severity | Phase |
|------|----------|-------|
| Auth token provisioning (`token: ''` in handshake) | HIGH | Phase 4 |
| Evidence stored only in InMemoryArtifactStore | MEDIUM | Phase 4 |
| No rate limiting on reconnect burst | LOW | Phase 4 |
