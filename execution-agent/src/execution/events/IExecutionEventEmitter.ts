// ─── IExecutionEventEmitter ───────────────────────────────────────────────────
// Abstraction over event persistence used by ExecutionEngine and StepExecutor.
// Tests inject a RecordingExecutionEventEmitter.
// Production: wire up EventBusExecutionEventEmitter (Phase 4).
//
// The emitter owns sequence numbering per session internally.
// Callers supply only the domain payload + the ExecutionContext for metadata.

import type { ExecutionStartedPayload,
              StepIntendedPayload,
              StepCompletedPayload,
              StepFailedPayload }       from '../../events/definitions/execution.events.js';
import type { SessionCompletedPayload,
              ExecutionCancelledPayload,
              ExecutionFailedPayload }  from '../../events/definitions/session.events.js';
import type { ExecutionContext }        from '../ExecutionContext.js';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IExecutionEventEmitter {
  emitExecutionStarted(payload: ExecutionStartedPayload,  ctx: ExecutionContext): Promise<void>;
  /** WAL write — MUST resolve before DriverHost.execute() is called. */
  emitStepIntended   (payload: StepIntendedPayload,       ctx: ExecutionContext): Promise<void>;
  emitStepCompleted  (payload: StepCompletedPayload,      ctx: ExecutionContext): Promise<void>;
  emitStepFailed     (payload: StepFailedPayload,         ctx: ExecutionContext): Promise<void>;
  emitExecutionCompleted (payload: SessionCompletedPayload,    ctx: ExecutionContext): Promise<void>;
  emitExecutionFailed    (payload: ExecutionFailedPayload,     ctx: ExecutionContext): Promise<void>;
  emitExecutionCancelled (payload: ExecutionCancelledPayload,  ctx: ExecutionContext): Promise<void>;
}

// ─── Emitted event record (for testing / audit) ───────────────────────────────

export interface EmittedEvent {
  kind: string;
  payload: unknown;
  executionId: string;
  sessionId: string;
  emittedAt: string;  // ISO8601Z
}

// ─── RecordingExecutionEventEmitter (test double) ────────────────────────────

export class RecordingExecutionEventEmitter implements IExecutionEventEmitter {
  readonly events: EmittedEvent[] = [];

  private _record(kind: string, payload: unknown, ctx: ExecutionContext): void {
    this.events.push({
      kind,
      payload,
      executionId: ctx.executionId,
      sessionId:   ctx.sessionId,
      emittedAt:   new Date().toISOString(),
    });
  }

  async emitExecutionStarted(p: ExecutionStartedPayload, ctx: ExecutionContext): Promise<void> {
    this._record('ExecutionStarted', p, ctx);
  }
  async emitStepIntended(p: StepIntendedPayload, ctx: ExecutionContext): Promise<void> {
    this._record('StepIntended', p, ctx);
  }
  async emitStepCompleted(p: StepCompletedPayload, ctx: ExecutionContext): Promise<void> {
    this._record('StepCompleted', p, ctx);
  }
  async emitStepFailed(p: StepFailedPayload, ctx: ExecutionContext): Promise<void> {
    this._record('StepFailed', p, ctx);
  }
  async emitExecutionCompleted(p: SessionCompletedPayload, ctx: ExecutionContext): Promise<void> {
    this._record('ExecutionCompleted', p, ctx);
  }
  async emitExecutionFailed(p: ExecutionFailedPayload, ctx: ExecutionContext): Promise<void> {
    this._record('ExecutionFailed', p, ctx);
  }
  async emitExecutionCancelled(p: ExecutionCancelledPayload, ctx: ExecutionContext): Promise<void> {
    this._record('ExecutionCancelled', p, ctx);
  }

  /** Convenience: all emitted event kinds in order. */
  kinds(): string[] {
    return this.events.map(e => e.kind);
  }

  /** Find all emitted events of a specific kind. */
  ofKind(kind: string): EmittedEvent[] {
    return this.events.filter(e => e.kind === kind);
  }
}
