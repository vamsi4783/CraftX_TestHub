// ─── WebSocketEventEmitter ────────────────────────────────────────────────────
// IExecutionEventEmitter implementation that forwards each execution event
// through EventForwarder → AgentHubServer.broadcast → browser clients.
//
// All seven IExecutionEventEmitter methods are implemented here.
// Errors in forwarding are swallowed (logged by EventForwarder) so a send
// failure never crashes the running execution.

import type { IExecutionEventEmitter }    from './IExecutionEventEmitter.js';
import type { ExecutionContext }          from '../ExecutionContext.js';
import type { EventForwarder }           from '../../communication/EventForwarder.js';
import type {
  ExecutionStartedPayload,
  StepIntendedPayload,
  StepCompletedPayload,
  StepFailedPayload,
}                                        from '../../events/definitions/execution.events.js';
import type {
  SessionCompletedPayload,
  ExecutionCancelledPayload,
  ExecutionFailedPayload,
}                                        from '../../events/definitions/session.events.js';

export class WebSocketEventEmitter implements IExecutionEventEmitter {
  constructor(private readonly forwarder: EventForwarder) {}

  async emitExecutionStarted(
    payload: ExecutionStartedPayload,
    ctx:     ExecutionContext,
  ): Promise<void> {
    this.forwarder.forwardEvent(
      'ExecutionStarted',
      payload as unknown as Record<string, unknown>,
      ctx.sessionId,
    );
  }

  async emitStepIntended(
    payload: StepIntendedPayload,
    ctx:     ExecutionContext,
  ): Promise<void> {
    this.forwarder.forwardEvent(
      'StepIntended',
      payload as unknown as Record<string, unknown>,
      ctx.sessionId,
    );
  }

  async emitStepCompleted(
    payload: StepCompletedPayload,
    ctx:     ExecutionContext,
  ): Promise<void> {
    this.forwarder.forwardEvent(
      'StepCompleted',
      payload as unknown as Record<string, unknown>,
      ctx.sessionId,
    );
  }

  async emitStepFailed(
    payload: StepFailedPayload,
    ctx:     ExecutionContext,
  ): Promise<void> {
    this.forwarder.forwardEvent(
      'StepFailed',
      payload as unknown as Record<string, unknown>,
      ctx.sessionId,
    );
  }

  async emitExecutionCompleted(
    payload: SessionCompletedPayload,
    ctx:     ExecutionContext,
  ): Promise<void> {
    this.forwarder.forwardEvent(
      'ExecutionCompleted',
      payload as unknown as Record<string, unknown>,
      ctx.sessionId,
    );
  }

  async emitExecutionFailed(
    payload: ExecutionFailedPayload,
    ctx:     ExecutionContext,
  ): Promise<void> {
    this.forwarder.forwardEvent(
      'ExecutionFailed',
      payload as unknown as Record<string, unknown>,
      ctx.sessionId,
    );
  }

  async emitExecutionCancelled(
    payload: ExecutionCancelledPayload,
    ctx:     ExecutionContext,
  ): Promise<void> {
    this.forwarder.forwardEvent(
      'ExecutionCancelled',
      payload as unknown as Record<string, unknown>,
      ctx.sessionId,
    );
  }
}
