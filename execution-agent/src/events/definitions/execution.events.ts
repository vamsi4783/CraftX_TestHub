// ─── Execution Event Payload Types ──────────────────────────────────────────

import type { AutomationConfig } from '../envelope.js';

export interface ExecutionStartedPayload {
  session_id: string;
  test_case_id: string;
  driver_id: string;
  total_steps: number;
}

export interface StepIntendedPayload {
  session_id: string;
  step_id: string;
  step_number: number;
  action: AutomationConfig;
}

export interface StepCompletedPayload {
  session_id: string;
  step_id: string;
  step_number: number;
  duration_ms: number;
  assertion_passed: boolean;
}

export interface StepFailedPayload {
  session_id: string;
  step_id: string;
  step_number: number;
  duration_ms: number;
  failure_reason: string;
  rule_pack_id?: string;
}
