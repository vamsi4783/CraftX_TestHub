// ─── Events barrel export ────────────────────────────────────────────────────

export type { EventEnvelope, CommandEnvelope, AutomationConfig } from './envelope.js';
export type {
  RunSessionPayload,
  ExecuteStepPayload,
  PauseSessionPayload,
  CancelExecutionPayload,
} from './envelope.js';

export type {
  ExecutionStartedPayload,
  StepIntendedPayload,
  StepCompletedPayload,
  StepFailedPayload,
} from './definitions/execution.events.js';

export type { EvidenceCapturedPayload } from './definitions/evidence.events.js';

export type {
  SessionPausedPayload,
  SessionCompletedPayload,
  ExecutionCancelledPayload,
} from './definitions/session.events.js';

export type { RulePackViolationPayload } from './definitions/rule.events.js';

export type {
  AgentHeartbeatPayload,
  ConnectedDevice,
} from './definitions/health.events.js';
