// ─── Autonomous Runner Types (web app, Phase 4 M3) ───────────────────────────

export type ExecutionMode = 'Manual' | 'SemiAuto' | 'FullyAuto';

export type RunnerState =
  | 'Idle'
  | 'Running'
  | 'PausedBeforeStep'
  | 'PausedOnFailure'
  | 'Cancelling'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

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
  description:  string;
  action:       string;
  driverId:     string;
  status:       StepRunStatus;
  duration_ms:  number;
  error?:       string;
  retryCount:   number;
  startedAt?:   string;
  completedAt?: string;
}

export interface RunnerTimelineEvent {
  id:          string;
  kind:        string;
  stepId?:     string;
  stepNumber?: number;
  offsetMs:    number;
  message:     string;
}

export interface RunnerReport {
  runId:          string;
  state:          RunnerState;
  mode:           ExecutionMode;
  totalSteps:     number;
  passedSteps:    number;
  failedSteps:    number;
  skippedSteps:   number;
  duration_ms:    number;
  stepProgress:   StepProgress[];
  startedAt:      string;
  completedAt?:   string;
  error?:         string;
  cancelReason?:  string;
  evidenceCount:  number;
  timelineEvents: RunnerTimelineEvent[];
}

export interface RunnerConfig {
  mode:          ExecutionMode;
  maxRetries:    number;
  stopOnFailure: boolean;
  retryDelayMs:  number;
  stepDelayMs:   number;   // simulation: ms between steps
}

export const DEFAULT_RUNNER_CONFIG: RunnerConfig = {
  mode:          'FullyAuto',
  maxRetries:    0,
  stopOnFailure: true,
  retryDelayMs:  1_000,
  stepDelayMs:   800,
};
