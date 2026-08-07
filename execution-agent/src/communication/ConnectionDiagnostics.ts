// ─── ConnectionDiagnostics ────────────────────────────────────────────────────
// Read-only snapshot of communication-layer health.
// Consumed by GetDiagnostics command and the runtime diagnostics API.

import { PROTOCOL_VERSION } from './MessageProtocol.js';
import type { ConnectionState } from './AgentConnectionManager.js';

export interface ConnectionDiagnosticSnapshot {
  readonly snapshotAt:       string;          // ISO8601Z
  readonly protocolVersion:  string;
  readonly connectionState:  ConnectionState;
  readonly connectionUptimeMs: number;        // 0 if not connected
  readonly reconnectCount:   number;
  readonly lastHeartbeatAt:  string | null;   // ISO8601Z, null if none sent
  readonly serverUrl:        string;
  readonly messagesSent:     number;
  readonly messagesReceived: number;
}

export class ConnectionDiagnostics {
  private _lastHeartbeatAt: string | null = null;
  private _messagesSent     = 0;
  private _messagesReceived = 0;

  constructor(
    private readonly serverUrl:  string,
    private readonly getState:   () => ConnectionState,
    private readonly getConnectedAt: () => number | null,
    private readonly getReconnectCount: () => number,
  ) {}

  recordHeartbeatSent(): void {
    this._lastHeartbeatAt = new Date().toISOString();
  }

  recordMessageSent(): void     { this._messagesSent++; }
  recordMessageReceived(): void { this._messagesReceived++; }

  snapshot(): ConnectionDiagnosticSnapshot {
    const connectedAt = this.getConnectedAt();
    const uptimeMs    = connectedAt ? Date.now() - connectedAt : 0;

    return {
      snapshotAt:          new Date().toISOString(),
      protocolVersion:     PROTOCOL_VERSION,
      connectionState:     this.getState(),
      connectionUptimeMs:  uptimeMs,
      reconnectCount:      this.getReconnectCount(),
      lastHeartbeatAt:     this._lastHeartbeatAt,
      serverUrl:           this.serverUrl,
      messagesSent:        this._messagesSent,
      messagesReceived:    this._messagesReceived,
    };
  }
}
