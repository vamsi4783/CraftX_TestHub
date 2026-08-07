// ─── Execution Resume — Contracts Only ───────────────────────────────────────
// These types define the shape of crash-recovery resumption.
// Phase 3: no implementation — the Write-Ahead Log lays the groundwork.
// Phase 7: ExecutionEngine.resume() reads the WAL and reconstructs state.

import type { ExecutionState, StepResult } from '../ExecutionTypes.js';

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export interface ExecutionSnapshot {
  /** UUID of the execution that was interrupted. */
  executionId: string;
  sessionId: string;
  projectId: string;
  organizationId: string;
  /** State at the moment of interruption. */
  stateAtInterruption: ExecutionState;
  /** Step that was in-flight or last completed at interruption. */
  lastIntendedStep: number;
  /** Results for steps that completed before interruption. */
  completedStepResults: StepResult[];
  /** ISO8601Z timestamp of the last StepIntended event (WAL marker). */
  lastWalTimestamp: string;
  /** ISO8601Z timestamp when the snapshot was taken. */
  snapshotAt: string;
}

// ─── Resume cursor ────────────────────────────────────────────────────────────

export interface ResumeCursor {
  /** The execution to resume. */
  executionId: string;
  /** Resume from this step number (1-based, inclusive). */
  resumeFromStep: number;
  /** Pre-existing results to carry forward — not re-executed. */
  priorResults: StepResult[];
}

// ─── Resume result ────────────────────────────────────────────────────────────

export interface ResumeResult {
  /** True if the resume was accepted and execution restarted. */
  accepted: boolean;
  /** Reason if rejected (e.g. terminal state, incompatible schema version). */
  rejectionReason?: string;
  /** Original snapshot used to build the cursor. */
  snapshot?: ExecutionSnapshot;
}

// ─── IResumableExecutionEngine (Phase 7 contract) ────────────────────────────

export interface IResumableExecutionEngine {
  /**
   * Attempt to resume an interrupted execution from a snapshot.
   * Phase 3: always returns { accepted: false, rejectionReason: 'not_implemented' }.
   */
  resume(snapshot: ExecutionSnapshot): Promise<ResumeResult>;
}
