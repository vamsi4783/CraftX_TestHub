// ─── Recording State Machine ──────────────────────────────────────────────────

export type RecordingState =
  | 'IDLE'       // No session. Toolbar hidden.
  | 'READY'      // Initialized, waiting for user to press Record.
  | 'RECORDING'  // Actively recording.
  | 'PAUSED'     // Recording paused. Timer frozen. Logcat continues.
  | 'STOPPING'   // Stop pressed. Flushing data.
  | 'SAVING'     // Writing metadata to Supabase.
  | 'COMPLETED'  // All data saved. Session done.
  | 'CANCELLED'  // All data deleted. No DB record remains.
  | 'ERROR';     // Unrecoverable error. Requires manual reset.

// ─── Runner ───────────────────────────────────────────────────────────────────

export type RunnerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ─── Timeline ─────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | 'recording_started'
  | 'recording_paused'
  | 'recording_resumed'
  | 'recording_stopped'
  | 'recording_cancelled'
  | 'action'
  | 'screenshot'
  | 'annotation'
  | 'error';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  description: string;
  /** Milliseconds from recording start, excluding paused time. */
  offsetMs: number;
  metadata?: Record<string, unknown>;
}

// ─── Screenshots ──────────────────────────────────────────────────────────────

export type ScreenshotType = 'manual' | 'failure' | 'final' | 'auto';

export interface ScreenshotRecord {
  id: string;
  type: ScreenshotType;
  /** Absolute path on Automation Runner machine. Never uploaded. */
  localPath: string;
  offsetMs: number;
  capturedAt: Date;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface RecordingConfig {
  testSessionId?: string;
  releaseId?: string;
  buildVersion?: string;
  deviceName: string;
  deviceOs?: string;
  runnerId?: string;
}

export interface RecordingSession extends RecordingConfig {
  /** Supabase row ID, set after createRecording(). Empty string before insert. */
  id: string;
  testerId: string;
  startedAt?: Date;
  stoppedAt?: Date;
  /** Accumulates pause durations so elapsed timer stays accurate. */
  totalPausedMs: number;
  /** Set at the moment Pause is pressed; cleared on Resume. */
  lastPausedAt?: Date;
  /** Root folder on the Automation Runner machine. */
  localFolder: string;
  screenshotCount: number;
}

// ─── Storage estimate ─────────────────────────────────────────────────────────

export interface StorageEstimate {
  screenshotCount: number;
  /** Rough estimate in megabytes. */
  estimatedMb: number;
}

// ─── Retention ────────────────────────────────────────────────────────────────

export type RetentionPolicy = '7d' | '30d' | '90d' | 'forever';
