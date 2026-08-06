// ─── Session Event Payload Types ─────────────────────────────────────────────

export interface SessionPausedPayload {
  session_id: string;
  paused_at: string;  // ISO8601Z
}

export interface SessionCompletedPayload {
  session_id: string;
  total_steps: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
}

export interface ExecutionCancelledPayload {
  session_id: string;
  cancelled_by: string;  // agent_id or user_id
  reason: string;
}
