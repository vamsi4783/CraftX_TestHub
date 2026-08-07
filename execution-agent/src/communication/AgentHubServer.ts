// ─── AgentHubServer ───────────────────────────────────────────────────────────
// WebSocket server that browser clients connect to.
// Listens on a configurable port (default 8080).
//
// Responsibilities:
//   • Accept browser WebSocket connections
//   • Handle AuthHandshake → respond with AuthResult { accepted: true }
//   • Route Command messages → CommandRouter → send ResponseMessage back
//   • Expose broadcast() so EventForwarder can push events to all clients
//   • Broadcast heartbeats sent by HeartbeatService / AgentRuntime

import WebSocket, { WebSocketServer } from 'ws';
import { uuidv7 }                     from 'uuidv7';
import { MessageSerializer }          from './MessageSerializer.js';
import { PROTOCOL_VERSION }           from './MessageProtocol.js';
import { StructuredLogger }           from '../logging/StructuredLogger.js';
import type { CommandRouter }         from './CommandRouter.js';
import type {
  CommandMessage,
  AuthHandshakeMessage,
  AuthResultMessage,
  AgentMessage,
}                                     from './MessageProtocol.js';
import type { AgentHeartbeatPayload } from '../events/definitions/health.events.js';
import type { HeartbeatMessage }      from './MessageProtocol.js';

export interface AgentHubConfig {
  port:    number;
  /** If false, accept all AuthHandshake messages without validating the token. Default: false. */
  requireToken?: boolean;
  /** Required token value when requireToken is true. */
  token?: string;
}

export class AgentHubServer {
  private readonly logger     = new StructuredLogger('AgentHubServer');
  private readonly serializer = new MessageSerializer();
  private readonly clients    = new Set<WebSocket>();
  private wss: WebSocketServer | null = null;
  private router: CommandRouter | null = null;

  constructor(private readonly config: AgentHubConfig) {}

  setRouter(router: CommandRouter): void {
    this.router = router;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    this.wss = new WebSocketServer({ port: this.config.port });

    this.wss.on('connection', (ws: WebSocket) => {
      this.logger.info('client_connected', { total: this.clients.size + 1 });
      this.clients.add(ws);

      ws.on('message', (raw: Buffer | string) => {
        void this._handleMessage(ws, raw.toString());
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.logger.info('client_disconnected', { remaining: this.clients.size });
      });

      ws.on('error', (err: Error) => {
        this.logger.error('client_ws_error', { error: err.message });
        this.clients.delete(ws);
      });
    });

    this.wss.on('error', (err: Error) => {
      this.logger.error('hub_server_error', { error: err.message });
    });

    this.logger.info('hub_started', { port: this.config.port });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) { resolve(); return; }
      // Close all client connections
      for (const client of this.clients) {
        client.close(1001, 'AgentHub shutting down');
      }
      this.clients.clear();
      this.wss.close(() => {
        this.logger.info('hub_stopped');
        resolve();
      });
    });
  }

  // ─── Outbound ──────────────────────────────────────────────────────────────

  /** Push a serialised message to every connected browser client. */
  broadcast(data: string): void {
    let sent = 0;
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
        sent++;
      }
    }
    if (sent === 0 && this.clients.size > 0) {
      this.logger.debug('broadcast_no_open_clients', { total: this.clients.size });
    }
  }

  /** Convenience: broadcast a heartbeat payload. */
  broadcastHeartbeat(payload: AgentHeartbeatPayload): void {
    const msg: HeartbeatMessage = {
      messageId:       uuidv7(),
      correlationId:   payload.agent_id,
      timestamp:       new Date().toISOString(),
      protocolVersion: PROTOCOL_VERSION,
      type:            'Heartbeat',
      payload,
    };
    this.broadcast(this.serializer.serialize(msg));
  }

  get connectedClients(): number {
    return this.clients.size;
  }

  // ─── Inbound ───────────────────────────────────────────────────────────────

  private async _handleMessage(ws: WebSocket, raw: string): Promise<void> {
    let msg: AgentMessage;
    try {
      msg = this.serializer.parse(raw);
    } catch (err) {
      this.logger.warn('parse_error', {
        error: err instanceof Error ? err.message : String(err),
        raw:   raw.slice(0, 120),
      });
      return;
    }

    if (msg.type === 'AuthHandshake') {
      this._handleHandshake(ws, msg as AuthHandshakeMessage);
      return;
    }

    if (msg.type === 'Command') {
      if (!this.router) {
        this.logger.warn('command_no_router', { commandType: (msg as CommandMessage).commandType });
        return;
      }
      const response = await this.router.route(msg as CommandMessage);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(this.serializer.serialize(response));
      }
      return;
    }

    this.logger.debug('message_ignored', { type: msg.type });
  }

  private _handleHandshake(ws: WebSocket, msg: AuthHandshakeMessage): void {
    const accepted = !this.config.requireToken || msg.token === this.config.token;

    const result: AuthResultMessage = {
      messageId:       uuidv7(),
      correlationId:   msg.correlationId,
      timestamp:       new Date().toISOString(),
      protocolVersion: PROTOCOL_VERSION,
      type:            'AuthResult',
      accepted,
      reason:          accepted ? undefined : 'Invalid token',
    };

    if (!accepted) {
      this.logger.warn('auth_rejected', { agentId: msg.agentId });
      ws.send(this.serializer.serialize(result));
      ws.close(4001, 'Authentication failed');
      this.clients.delete(ws);
      return;
    }

    ws.send(this.serializer.serialize(result));
    this.logger.info('client_authenticated', {
      agentId:   msg.agentId,
      version:   msg.agentVersion,
      org:       msg.organizationId,
    });
  }
}
