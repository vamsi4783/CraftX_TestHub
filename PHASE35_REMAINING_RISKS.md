# Phase 3.5 — Remaining Operational Risks
**Date:** 2026-08-07

---

## HIGH

### H1 — Auth Token Provisioning
`AgentServer._sendHandshake()` sends `token: ''`. No real token exchange is implemented.  
**Impact:** Production server will reject the handshake; agent will enter `AuthenticationFailed` state and stop.  
**Mitigation:** `AuthenticationFailed` state is correctly implemented and does not retry. Phase 4 must provision a real token before the agent can connect.

### H2 — No Live WebSocket Server Tested
All transport tests use `ManualTransportFactory`. No real WebSocket server has been stood up.  
**Impact:** Unknown latency and failure modes in live server path.  
**Mitigation:** Transport abstraction is correct; swap is a single integration point. Protocol framing is validated by `MessageSerializer` tests.

---

## MEDIUM

### M1 — Evidence Supabase Backend Unimplemented
All evidence is stored in `InMemoryArtifactStore`. Data is lost on process restart.  
**Impact:** Phase 4 cannot deliver evidence persistence until adapter is written.  
**Mitigation:** `IArtifactStore` interface is simple (one method: `put(path, data, mimeType)`). Supabase Storage upload is a single API call.

### M2 — AndroidDriver Requires Physical Device
`AndroidDriver` is unit-tested with stubs only. No live ADB execution path has been exercised through the `DriverHost → StepExecutor → ExecutionEngine` chain.  
**Impact:** Device-specific bugs (capability mismatch, ADB error formats) are undetected.  
**Mitigation:** ADB operations themselves are validated directly (6 operation types, all passing). The driver wiring is the only unvalidated segment.

### M3 — EvidenceQueue Has No Depth Limit
No maximum queue depth is enforced. A stalled upload loop could grow the queue unbounded.  
**Impact:** Memory pressure in long-running sessions.  
**Mitigation:** Phase 4 concern. In-process memory is bounded by Node.js heap limit; process restart clears the queue.

---

## LOW

### L1 — Bundle Size Warning
TestHub web app bundle is 1 945 KB (556 KB gzip). Vite warns at > 500 KB.  
**Impact:** Slower initial load in production.  
**Mitigation:** Dynamic imports (code-splitting) can be added post-release without API changes.

### L2 — agentStore Commands Are Stubs
M9 agentStore `executeTest`, `cancelExecution`, and `getDeviceList` update local state only.  
**Impact:** The UI is not connected to the real agent.  
**Mitigation:** Phase 4 wires these to `AgentServer.sendCommand()`. Interface is already aligned.

### L3 — No Rate Limiting on Reconnect Burst
`AgentConnectionManager` applies exponential backoff but does not implement jitter.  
**Impact:** In a fleet scenario, many agents could reconnect simultaneously after a server restart.  
**Mitigation:** Jitter can be added to `evaluateReconnect` without breaking the interface. Not a Phase 4 blocker.

---

## Risk Register Summary

| ID | Severity | Status | Phase |
|----|----------|--------|-------|
| H1 Auth token | HIGH | Open | 4 |
| H2 Live WebSocket | HIGH | Open | 4 |
| M1 Evidence backend | MEDIUM | Open | 4 |
| M2 AndroidDriver live | MEDIUM | Open | 4 |
| M3 Queue depth | MEDIUM | Open | 4+ |
| L1 Bundle size | LOW | Open | post-release |
| L2 agentStore stubs | LOW | Open | 4 |
| L3 Reconnect jitter | LOW | Open | 4+ |
