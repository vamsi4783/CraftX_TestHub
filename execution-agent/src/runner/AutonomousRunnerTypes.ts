// ─── Autonomous Runner Types (Phase 4 M3) ────────────────────────────────────
// Pure data types for the AutonomousRunnerEngine.
// No UI, no recorder, no EventBus — only runner concerns.

// ─── Execution mode ───────────────────────────────────────────────────────────

/**
 * Manual:      Runner pauses before EVERY step; user must call resumeStep().
 * SemiAuto:    Runner pauses only on failure; user decides retry/skip/abort.
 * FullyAuto:   Runner runs end-to-end without pausing (cancel only).
 */
export type ExecutionMode = 'Manual' | 'SemiAuto' | 'FullyAuto';

// ─── Runner state ─────────────────────────────────────────────────────────────

export type RunnerState =
  | 'Idle'
  | 'Running'
  | 'PausedBeforeStep'   // Manual: waiting for user to confirm next step
  | 'PausedOnFailure'    // SemiAuto: waiting for user to retry/skip/abort
  | 'Cancelling'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

// ─── Per-step status ──────────────────────────────────────────────────────────

export type StepRunStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'retrying';

export interface StepProgress {
  stepId:       string;
  stepNumber:   number;
  action:       string;
  driverId:     string;
  status:       StepRunStatus;
  duration_ms:  number;
  error?:       string;
  retryCount:   number;
  startedAt?:   string;   // ISO 8601
  completedAt?: string;   // ISO 8601
  evidenceIds:  string[];
}

// ─── Runner config ────────────────────────────────────────────────────────────

export interface RunnerConfig {
  /** Max retries per step before marking it failed. Default: 0. */
  maxRetries:             number;
  /** Whether a step failure aborts the run. Default: true for FullyAuto/Manual. */
  stopOnFailure:          boolean;
  /** ms between step attempts on retry. Default: 1 000. */
  retryDelayMs:           number;
  /** ms before a step is considered timed-out (driver default used if 0). */
  stepTimeoutMs:          number;
  mode:                   ExecutionMode;
}

export const DEFAULT_RUNNER_CONFIG: RunnerConfig = {
  maxRetries:   0,
  stopOnFailure: true,
  retryDelayMs: 1_000,
  stepTimeoutMs: 0,
  mode:         'FullyAuto',
};

// ─── Run report ───────────────────────────────────────────────────────────────

export interface RunnerReport {
  runId:         string;
  sessionId:     string;
  testCaseId:    string;
  state:         RunnerState;
  mode:          ExecutionMode;
  totalSteps:    number;
  passedSteps:   number;
  failedSteps:   number;
  skippedSteps:  number;
  duration_ms:   number;
  stepProgress:  StepProgress[];
  startedAt:     string;     // ISO 8601
  completedAt?:  string;     // ISO 8601
  error?:        string;
  cancelReason?: string;
  evidenceCount: number;
  timelineEvents: RunnerTimelineEvent[];
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export type RunnerTimelineEventKind =
  | 'RunStarted'
  | 'StepStarted'
  | 'StepPassed'
  | 'StepFailed'
  | 'StepSkipped'
  | 'StepRetrying'
  | 'PausedBeforeStep'
  | 'PausedOnFailure'
  | 'Resumed'
  | 'Cancelled'
  | 'RunCompleted'
  | 'RunFailed';

export interface RunnerTimelineEvent {
  id:         string;
  kind:       RunnerTimelineEventKind;
  stepId?:    string;
  stepNumber?: number;
  offsetMs:   number;   // ms from run start
  message:    string;
  metadata?:  Record<string, unknown>;
}

// ─── Pause / resume signal ────────────────────────────────────────────────────

/** Bidirectional signal object shared between AutonomousRunnerEngine and its caller. */
export interface PauseResumeSignal {
  /** Set to true by the caller to request a pause. */
  pauseRequested: boolean;
  /** Set to true by the caller to confirm they want to proceed after a pause. */
  resumeConfirmed: boolean;
  /**
   * In SemiAuto mode after a failure, the caller sets this to decide what to do.
   * 'retry'  — re-run the failed step (up to maxRetries).
   * 'skip'   — mark the step as skipped and continue.
   * 'abort'  — stop the run immediately.
   */
  failureDecision?: 'retry' | 'skip' | 'abort';
}

export function makePauseResumeSignal(): PauseResumeSignal {
  return { pauseRequested: false, resumeConfirmed: false };
}
