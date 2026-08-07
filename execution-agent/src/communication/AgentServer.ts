// ─── AgentServer ──────────────────────────────────────────────────────────────
// Owns WebSocket lifecycle, authentication handshake, reconnect scheduling,
// message serialisation, command dispatch, and event forwarding.
//
// No UI, no Recorder in Phase 3.
// WebSocket transport is fully injectable (ITransportFactory) for testability.

import { uuidv7 }                  from 'uuidv7';
import { MessageSerializer }       from './MessageSerializer.js';
import { AgentConnectionManager }  from './AgentConnectionManager.js';
import { CommandRouter }           from './CommandRouter.js';
import { EventForwarder }          from './EventForwarder.js';
import { ConnectionDiagnostics }   from './ConnectionDiagnostics.js';
import { PROTOCOL_VERSION }        from './MessageProtocol.js';
import { StructuredLogger }        from '../logging/StructuredLogger.js';
import type { ITransportFactory, IWebSocketTransport } from './IWebSocketTransport.js';
import type { AgentRuntime }       from '../runtime/AgentRuntime.js';
import type { RuntimeConfiguration } from '../runtime/RuntimeConfiguration.js';
import type { ReconnectPolicy }    from './ReconnectStrategy.js';
import type {
  AgentMessage,
  CommandMessage,
  AuthResultMessage,
}                                  from './MessageProtocol.js';
import type { AgentHeartbeatPayload } from '../events/definitions/health.events.js';

export interface AgentServerConfig {
  serverUrl:       string;
  reconnectPolicy: ReconnectPolicy;
}

/** Injectable timer abstraction — keeps AgentServer free of real setTimeout. */
export interface ServerTimer {
  delay(ms: number): Promise<void>;
}

export const REAL_SERVER_TIMER: ServerTimer = {
  delay(ms) { return new Promise(r => setTimeout(r, ms)); },
};

/** Immediate timer — used in tests to skip reconnect delays. */
export const INSTANT_SERVER_TIMER: ServerTimer = {
  delay(_ms) { return Promise.resolve(); },
};

export class AgentServer {
  private readonly logger      = new StructuredLogger('AgentServer');
  private readonly serializer  = new MessageSerializer();
  private readonly connManager: AgentConnectionManager;
  private readonly router:      CommandRouter;
  private readonly diagnostics: ConnectionDiagnostics;
  readonly forwarder:           EventForwarder;

  private _transport: IWebSocketTransport | null = null;
  private _running   = false;
  private _sequence  = 0;

  constructor(
    private readonly runtimeConfig: RuntimeConfiguration,
    private readonly serverConfig:  AgentServerConfig,
    runtime:       AgentRuntime,
    private readonly factory:       ITransportFactory,
    private readonly timer:         ServerTimer = REAL_SERVER_TIMER,
  ) {
    this.connManager = new AgentConnectionManager(
      serverConfig.reconnectPolicy,
      {
        onConnected:    () => this._onConnected(),
        onDisconnected: () => this._onDisconnected(),
        onReconnecting: (attempt, delay) => this._onReconnecting(attempt, delay),
        onAuthFailed:   (reason) => this._onAuthFailed(reason),
      },
    );

    this.router = new CommandRouter(runtime);

    this.diagnostics = new ConnectionDiagnostics(
      serverConfig.serverUrl,
      () => this.connManager.state,
      () => this.connManager.connectedAt,
      () => this.connManager.reconnectAttempts,
    );

    this.forwarder = new EventForwarder(
      runtimeConfig.agentId,
      (data) => this._safeSend(data),
      (msg)  => this.serializer.serialize(msg),
    );
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this._running) return;
    this._running = true;
    await this._openTransport();
  }

  async disconnect(): Promise<void> {
    this._running = false;
    this._transport?.close(1000, 'AgentServer shutdown');
    this._transport = null;
    if (!this.connManager.is('Disconnected')) {
      this.connManager.markDisconnected();
    }
  }

  // ─── Send ─────────────────────────────────────────────────────────────────

  /** Forward a heartbeat through the connection, if open. */
  sendHeartbeat(payload: AgentHeartbeatPayload): void {
    this.forwarder.forwardHeartbeat(payload);
    this.diagnostics.recordHeartbeatSent();
  }

  // ─── Diagnostics ─────────────────────────────────────────────────────────

  getDiagnostics() {
    return this.diagnostics.snapshot();
  }

  get connectionState() {
    return this.connManager.state;
  }

  // ─── Private — transport ─────────────────────────────────────────────────

  private async _openTransport(): Promise<void> {
    this.connManager.startConnecting();

    this._transport = this.factory.create(this.serverConfig.serverUrl, {
      onOpen:    ()                => this._handleOpen(),
      onMessage: (data)            => void this._handleMessage(data),
      onClose:   (code, reason)    => void this._handleClose(code, reason),
      onError:   (err)             => this._handleError(err),
    });
  }

  private _handleOpen(): void {
    this.logger.info('ws_open', { url: this.serverConfig.serverUrl });
    this._sendHandshake();
  }

  private async _handleMessage(raw: string): Promise<void> {
    this.diagnostics.recordMessageReceived();

    let msg: AgentMessage;
    try {
      msg = this.serializer.parse(raw);
    } catch (err) {
      this.logger.error('message_parse_error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (msg.type === 'AuthResult') {
      this._handleAuthResult(msg as AuthResultMessage);
      return;
    }

    if (msg.type === 'Command') {
      const response = await this.router.route(msg as CommandMessage);
      this._safeSend(this.serializer.serialize(response));
      return;
    }

    this.logger.debug('message_ignored', { type: msg.type });
  }

  private async _handleClose(code: number, reason: string): Promise<void> {
    this.logger.warn('ws_closed', { code, reason });
    this._transport = null;

    if (!this._running) {
      this.connManager.markDisconnected();
      return;
    }

    const decision = this.connManager.onConnectionLost();

    if (decision.shouldReconnect) {
      await this.timer.delay(decision.delayMs);
      if (this._running) {
        await this._openTransport();
      }
    }
  }

  private _handleError(err: Error): void {
    this.logger.error('ws_error', { error: err.message });
  }

  private _handleAuthResult(msg: AuthResultMessage): void {
    if (msg.accepted) {
      this.connManager.markConnected();
    } else {
      this.connManager.markAuthFailed(msg.reason ?? 'Authentication rejected');
      this._running = false;
      this._transport?.close(4001, 'Auth failed');
    }
  }

  private _sendHandshake(): void {
    const handshake = {
      messageId:       uuidv7(),
      correlationId:   this.runtimeConfig.agentId,
      timestamp:       new Date().toISOString(),
      protocolVersion: PROTOCOL_VERSION,
      type:            'AuthHandshake' as const,
      agentId:         this.runtimeConfig.agentId,
      agentVersion:    this.runtimeConfig.agentVersion,
      organizationId:  this.runtimeConfig.organizationId,
      token:           '',   // Phase 9: real token from config
    };
    this._safeSend(this.serializer.serialize(handshake));
  }

  private _onConnected(): void {
    this._sequence = 0;
    this.logger.info('agent_connected', { agentId: this.runtimeConfig.agentId });
  }

  private _onDisconnected(): void {
    this.logger.info('agent_disconnected');
  }

  private _onReconnecting(attempt: number, delayMs: number): void {
    this.logger.info('agent_reconnecting', { attempt, delay_ms: delayMs });
  }

  private _onAuthFailed(reason: string): void {
    this.logger.error('agent_auth_failed', { reason });
  }

  private _safeSend(data: string): void {
    if (this._transport?.readyState === 'OPEN') {
      this._transport.send(data);
      this._sequence++;
      this.diagnostics.recordMessageSent();
    } else {
      this.logger.warn('send_dropped_not_open', {
        state: this._transport?.readyState ?? 'no_transport',
      });
    }
  }
}
