// ─── Execution Engine barrel export ──────────────────────────────────────────

export type { ExecutionState,
              ExecutionStep,
              ExecutionRequest,
              ExecutionResult,
              StepResult }                from './ExecutionTypes.js';

export type { ExecutionContext }          from './ExecutionContext.js';

export type { MetricsHooks }             from './ExecutionMetrics.js';
export { NOOP_METRICS }                  from './ExecutionMetrics.js';

export { ExecutionStateMachine,
         IllegalTransitionError }        from './ExecutionStateMachine.js';

export type { IRulePack, RuleViolation } from './rules/IRulePack.js';

export type { ExecutionSnapshot,
              ResumeCursor,
              ResumeResult,
              IResumableExecutionEngine } from './resume/ExecutionResume.js';

export type { IExecutionEventEmitter,
              EmittedEvent }             from './events/IExecutionEventEmitter.js';
export { RecordingExecutionEventEmitter } from './events/IExecutionEventEmitter.js';

export { StepExecutor }                  from './StepExecutor.js';
export { ExecutionEngine }               from './ExecutionEngine.js';
