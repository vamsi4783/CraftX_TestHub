// ─── Execution Engine — Shared Types ─────────────────────────────────────────

import type { AutomationConfig } from '../events/envelope.js';
import type { CancellationToken } from '../drivers/DriverCancellation.js';
import type { IRulePack }         from './rules/IRulePack.js';

// ─── State ───────────────────────────────────────────────────────────────────

export type ExecutionState =
  | 'Requested'
  | 'Starting'
  | 'Running'
  | 'Paused'
  | 'Cancelling'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

// ─── Step ────────────────────────────────────────────────────────────────────

export interface ExecutionStep {
  stepId: string;
  stepNumber: number;
  action: AutomationConfig;
  /** Per-step timeout override. Falls back to DriverHost default. */
  timeout_ms?: number;
}

// ─── Request ─────────────────────────────────────────────────────────────────

export interface ExecutionRequest {
  sessionId: string;
  testCaseId: string;
  projectId: string;
  organizationId: string;
  /** e.g. "execution-agent/android" */
  agentId: string;
  /** Must be registered in the DriverRegistry. */
  driverId: string;
  steps: ExecutionStep[];
  driverConfig?: Record<string, unknown>;
  /** Omit for non-cancellable executions. */
  cancellationToken?: CancellationToken;
  /** RulePacks evaluated before each step. */
  rulePacks?: IRulePack[];
}

// ─── Step result ─────────────────────────────────────────────────────────────

export interface StepResult {
  stepId: string;
  stepNumber: number;
  action: string;
  success: boolean;
  duration_ms: number;
  screenshot?: Buffer;
  error?: string;
  /** True when a fatal RulePack violation blocked execution of this step. */
  skippedByRule?: boolean;
  ruleViolation?: import('./rules/IRulePack.js').RuleViolation;
}

// ─── Execution result ─────────────────────────────────────────────────────────

export interface ExecutionResult {
  executionId: string;
  sessionId: string;
  state: ExecutionState;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  duration_ms: number;
  stepResults: StepResult[];
  cancelReason?: string;
  error?: string;
}
