# Phase 3.5 — Performance Report
**Date:** 2026-08-07

---

## 1. Runtime Startup / Shutdown

| Metric | Observed | Budget |
|--------|----------|--------|
| AgentRuntime: Created → Running | **< 100 ms** (target < 100 ms) | ✅ |
| AgentRuntime: Running → Stopped | **< 50 ms** (target < 50 ms) | ✅ |

Source: `LiveIntegration.test.ts` — "starts and reaches Running state within 100ms", "stops and reaches Stopped state within 50ms".

---

## 2. Execution Engine Throughput (Production Classes, No Mocks)

| Metric | Observed |
|--------|----------|
| 100 × 2-step executions | **163 ms total** |
| Average per execution | **1.6 ms** |
| Throughput | **613 executions / second** |

Source: `LiveIntegration.test.ts` — "100 executions complete with 0 failures".

---

## 3. Step Latency

| Metric | Observed |
|--------|----------|
| 5-step execution (tap/swipe/type_text/screenshot/press_back) | ~31 ms total |
| Average per step | **6.2 ms** |

Source: `LiveIntegration.test.ts` — "5-step execution completes; events are ordered; WAL-correct".

---

## 4. Physical Android Device Latency

| Operation | Latency |
|-----------|---------|
| tap | 121 ms |
| swipe | 520 ms |
| back | 221 ms |
| launch app | 126 ms |
| screenshot | 1806 ms (15 631 bytes) |
| type text | 422 ms |

These are one-shot ADB latencies over USB, including process spawn overhead. Production performance over persistent ADB connection will be lower.

---

## 5. Chrome Browser Latency

| Operation | Latency |
|-----------|---------|
| connect | 418 ms (one-time) |
| navigate / setContent | 112 ms |
| screenshot (PNG) | 18 ms |
| fill + click | < 50 ms |

---

## 6. Evidence Pipeline Latency

| Operation | Observed |
|-----------|----------|
| collectScreenshot (in-memory) | < 5 ms |
| upload (in-memory artifact store) | < 5 ms |

Production latency with Supabase Storage backend is uncharacterized (Phase 4 concern).

---

## 7. Message Serialization

| Operation | Observed |
|-----------|----------|
| MessageSerializer.parse (valid) | < 1 ms |
| MessageSerializer.parse (invalid, throws) | < 1 ms |

---

## 8. Performance Regression Gate

All measurements above represent the V5 baseline. Phase 4 work must not regress:
- Execution throughput below 100 exec/sec (10× headroom from 613 exec/sec baseline)
- Runtime startup above 500 ms
- Runtime shutdown above 200 ms
