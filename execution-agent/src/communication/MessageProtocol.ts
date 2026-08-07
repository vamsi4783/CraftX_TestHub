// ─── Message Protocol ─────────────────────────────────────────────────────────
// All wire messages carry messageId, correlationId, timestamp, protocolVersion.
// Discriminated union on `type` — exhaustive switching is enforced by TypeScript.

import type { AgentHeartbeatPayload } from '../events/definitions/health.events.js';

export const PROTOCOL_VERSION = '1.0' as const;

// ─── Command types supported by the router ────────────────────────────────────

export type CommandType =
  | 'ExecuteTest'
  | 'CancelExecution'
  | 'GetHealth'
  | 'GetDiagnostics';

// ─── Base fields present on every message ─────────────────────────────────────

export interface BaseMessage {
  /** UUID v7 — unique per message. */
  readonly messageId:       string;
  /** Groups messages belonging to one logical operation. */
  readonly correlationId:   string;
  /** ISO8601Z. */
  readonly timestamp:       string;
  /** Wire protocol version. Always PROTOCOL_VERSION for outbound messages. */
  readonly protocolVersion: string;
}

// ─── Concrete message types ───────────────────────────────────────────────────

export interface CommandMessage extends BaseMessage {
  readonly type:        'Command';
  readonly commandType: CommandType;
  readonly payload:     Record<string, unknown>;
}

export interface EventMessage extends BaseMessage {
  readonly type:      'Event';
  readonly eventType: string;
  readonly payload:   Record<string, unknown>;
}

export interface HeartbeatMessage extends BaseMessage {
  readonly type:    'Heartbeat';
  readonly payload: AgentHeartbeatPayload;
}

export interface ResponseMessage extends BaseMessage {
  readonly type:      'Response';
  /** messageId of the CommandMessage this responds to. */
  readonly requestId: string;
  readonly success:   boolean;
  readonly payload:   Record<string, unknown>;
}

export interface ErrorMessage extends BaseMessage {
  readonly type:       'Error';
  readonly code:       string;
  readonly message:    string;
  readonly requestId?: string;
}

export interface AuthHandshakeMessage extends BaseMessage {
  readonly type:           'AuthHandshake';
  readonly agentId:        string;
  readonly agentVersion:   string;
  readonly organizationId: string;
  /** Opaque token — validated in Phase 9. Protocol only in Phase 3. */
  readonly token:          string;
}

export interface AuthResultMessage extends BaseMessage {
  readonly type:     'AuthResult';
  readonly accepted: boolean;
  readonly reason?:  string;
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type AgentMessage =
  | CommandMessage
  | EventMessage
  | HeartbeatMessage
  | ResponseMessage
  | ErrorMessage
  | AuthHandshakeMessage
  | AuthResultMessage;

export type MessageType = AgentMessage['type'];

// ─── Payload shapes for known commands ────────────────────────────────────────

export interface ExecuteTestPayload {
  sessionId:      string;
  testCaseId:     string;
  driverId:       string;
  driverConfig?:  Record<string, unknown>;
}

export interface CancelExecutionPayload {
  sessionId: string;
  reason:    string;
}

export interface GetHealthPayload {
  activeExecutions?: number;
  queueDepth?:       number;
}

export interface GetDiagnosticsPayload {
  // intentionally empty — no params needed
}
