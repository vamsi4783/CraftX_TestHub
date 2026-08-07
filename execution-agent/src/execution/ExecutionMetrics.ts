// ─── Execution Metrics Hooks ─────────────────────────────────────────────────
// Interface-only. No backend in Phase 3.
// Phase 6: swap NOOP_METRICS for a Prometheus/OTel implementation.

import type { ExecutionState } from './ExecutionTypes.js';

export interface MetricsHooks {
  /** Fired when ExecutionEngine begins processing a request. */
  execution_started(executionId: string, sessionId: string): void;
  /** Fired when execution reaches a terminal state (Completed/Failed/Cancelled). */
  execution_finished(executionId: string, state: ExecutionState, duration_ms: number): void;
  /** Fired just before StepIntended is persisted (WAL write). */
  step_started(executionId: string, stepId: string, stepNumber: number): void;
  /** Fired after StepCompleted or StepFailed is persisted. */
  step_finished(executionId: string, stepId: string, success: boolean, duration_ms: number): void;
  /** Convenience hook — same data as execution_finished.duration_ms; explicit for dashboards. */
  execution_duration(executionId: string, duration_ms: number): void;
}

/** No-op implementation. Used when no metrics backend is configured. */
export const NOOP_METRICS: MetricsHooks = {
  execution_started:  () => { /* no-op */ },
  execution_finished: () => { /* no-op */ },
  step_started:       () => { /* no-op */ },
  step_finished:      () => { /* no-op */ },
  execution_duration: () => { /* no-op */ },
};
