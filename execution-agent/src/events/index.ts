// ─── Events barrel export ────────────────────────────────────────────────────

export type { EventEnvelope, CommandEnvelope, AutomationConfig } from './envelope.js';
export type {
  RunSessionPayload,
  ExecuteStepPayload,
  PauseSessionPayload,
  CancelExecutionPayload,
  BuildEnvelopeParams,
  BuildCommandParams,
} from './envelope.js';
export { buildEnvelope, buildCommand } from './envelope.js';

export type { ValidationResult, ValidationError } from './ValidationResult.js';
export { validOk, validFail, validFailField }     from './ValidationResult.js';

export type { EventDefinition } from './EventDefinition.js';
export { JsonEventDefinition }  from './EventDefinition.js';

export {
  EventRegistry,
  DuplicateEventDefinitionError,
  UnknownEventError,
  EventValidationError,
} from './EventRegistry.js';

export { EnvelopeValidator } from './EnvelopeValidator.js';

export type {
  ReplayCursor,
  ReplayOptions,
  ReplayResult,
  IReplayableEventStore,
} from './replay/ReplayTypes.js';

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
