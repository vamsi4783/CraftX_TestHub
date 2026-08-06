// ─── CQRS Event + Command Envelopes ─────────────────────────────────────────
// V5 Phase 3 required schema. Every field is mandatory.
// Rule: events are past-tense facts; commands are future-tense intents.

export interface EventEnvelope<P = unknown> {
  /** UUID v7 — time-ordered for natural Event Store sorting. */
  event_id: string;
  /** Past-tense: StepCompleted, not CompleteStep. */
  event_type: string;
  /** Increment on breaking payload changes. Start at 1. */
  schema_version: number;
  /** UUID of the command or event that caused this. */
  causation_id: string;
  /** Session ID — groups all events for one execution session. */
  correlation_id: string;
  org_id: string;
  /** e.g. "execution-agent/android" or "execution-agent/chrome" */
  agent_id: string;
  /** ISO8601Z */
  occurred_at: string;
  /** Monotonic per correlation_id; starts at 1. */
  sequence: number;
  payload: P;
}

export interface CommandEnvelope<P = unknown> {
  /** UUID v4 */
  command_id: string;
  /** Imperative: RunSession, ExecuteStep, PauseSession, CancelExecution. */
  command_type: string;
  correlation_id: string;
  org_id: string;
  /** ISO8601Z */
  issued_at: string;
  payload: P;
}

// ─── Command Payload Types ───────────────────────────────────────────────────

export interface RunSessionPayload {
  session_id: string;
  test_case_id: string;
  driver_id: string;
  config: Record<string, unknown>;
}

export interface ExecuteStepPayload {
  session_id: string;
  step_id: string;
  step_number: number;
  action: AutomationConfig;
}

export interface PauseSessionPayload {
  session_id: string;
}

export interface CancelExecutionPayload {
  session_id: string;
  reason: string;
}

// ─── Automation Config (stored in test_steps.automation_config) ──────────────

export interface AutomationConfig {
  driver_id: string;
  action: string;
  selector?: string;
  value?: string;
  timeout_ms?: number;
  params?: Record<string, unknown>;
}
