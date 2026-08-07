// ─── EventForwarder ───────────────────────────────────────────────────────────
// Bridges the existing event abstractions to the wire layer.
// Receives execution events, heartbeat payloads, and health reports,
// serialises them as EventMessage / HeartbeatMessage, and forwards them
// through a send function (AgentServer.send).
//
// No direct coupling to EventBus — callers wire the subscriptions externally
// so this remains independently testable.

import { uuidv7 }           from 'uuidv7';
import { PROTOCOL_VERSION } from './MessageProtocol.js';
import { StructuredLogger } from '../logging/StructuredLogger.js';
import type {
  EventMessage,
  HeartbeatMessage,
}                           from './MessageProtocol.js';
import type { AgentHeartbeatPayload } from '../events/definitions/health.events.js';
import type { HealthReport }          from '../runtime/HealthReport.js';

export type ForwardSendFn = (data: string) => void;

export class EventForwarder {
  private readonly logger = new StructuredLogger('EventForwarder');
  private _forwarded = 0;

  constructor(
    private readonly agentId:      string,
    private readonly send:         ForwardSendFn,
    private readonly serialize:    (msg: EventMessage | HeartbeatMessage) => string,
  ) {}

  /** Forward a generic execution or health event by type + payload. */
  forwardEvent(
    eventType:     string,
    payload:       Record<string, unknown>,
    correlationId = '',
  ): void {
    const msg: EventMessage = {
      messageId:       uuidv7(),
      correlationId,
      timestamp:       new Date().toISOString(),
      protocolVersion: PROTOCOL_VERSION,
      type:            'Event',
      eventType,
      payload,
    };

    try {
      this.send(this.serialize(msg));
      this._forwarded++;
      this.logger.debug('event_forwarded', { eventType, messageId: msg.messageId });
    } catch (err) {
      this.logger.error('event_forward_failed', {
        eventType,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Forward an AgentHeartbeat payload as a HeartbeatMessage. */
  forwardHeartbeat(payload: AgentHeartbeatPayload): void {
    const msg: HeartbeatMessage = {
      messageId:       uuidv7(),
      correlationId:   this.agentId,
      timestamp:       new Date().toISOString(),
      protocolVersion: PROTOCOL_VERSION,
      type:            'Heartbeat',
      payload,
    };

    try {
      this.send(this.serialize(msg));
      this._forwarded++;
      this.logger.debug('heartbeat_forwarded', { messageId: msg.messageId });
    } catch (err) {
      this.logger.error('heartbeat_forward_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Forward a health report as a named event. */
  forwardHealth(report: HealthReport): void {
    this.forwardEvent('HealthReported', {
      status:           report.status,
      cpuPercent:       report.cpuPercent,
      memoryUsedMb:     report.memoryUsedMb,
      uptimeMs:         report.uptimeMs,
      activeExecutions: report.activeExecutions,
      queueDepth:       report.queueDepth,
    });
  }

  get forwardedCount(): number { return this._forwarded; }
}
