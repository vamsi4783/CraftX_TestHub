// ─── AgentConnectionManager ───────────────────────────────────────────────────
// Tracks connection state and drives reconnect scheduling.
// State machine: Disconnected ↔ Connecting → Connected → Reconnecting → …
// Reconnect decisions are delegated to evaluateReconnect (pure).

import { evaluateReconnect, DEFAULT_RECONNECT_POLICY } from './ReconnectStrategy.js';
import { StructuredLogger } from '../logging/StructuredLogger.js';
import type { ReconnectPolicy, ReconnectDecision } from './ReconnectStrategy.js';

export type ConnectionState =
  | 'Disconnected'
  | 'Connecting'
  | 'Connected'
  | 'Reconnecting'
  | 'AuthenticationFailed';

const VALID_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
  Disconnected:         ['Connecting'],
  Connecting:           ['Connected', 'Reconnecting', 'AuthenticationFailed', 'Disconnected'],
  Connected:            ['Reconnecting', 'Disconnected'],
  Reconnecting:         ['Connecting', 'Disconnected'],
  AuthenticationFailed: ['Disconnected'],
};

export class IllegalConnectionTransitionError extends Error {
  constructor(from: ConnectionState, to: ConnectionState) {
    super(`Illegal connection state transition: "${from}" → "${to}"`);
    this.name = 'IllegalConnectionTransitionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ConnectionManagerCallbacks {
  onConnected():    void;
  onDisconnected(): void;
  onReconnecting(attemptNumber: number, delayMs: number): void;
  onAuthFailed(reason: string): void;
}

const NOOP_CALLBACKS: ConnectionManagerCallbacks = {
  onConnected:    () => undefined,
  onDisconnected: () => undefined,
  onReconnecting: () => undefined,
  onAuthFailed:   () => undefined,
};

export class AgentConnectionManager {
  private readonly logger = new StructuredLogger('AgentConnectionManager');
  private _state: ConnectionState = 'Disconnected';
  readonly history: ConnectionState[] = ['Disconnected'];

  private _reconnectAttempts  = 0;
  private _connectedAt: number | null = null;
  private readonly callbacks: ConnectionManagerCallbacks;

  constructor(
    private readonly reconnectPolicy: ReconnectPolicy = DEFAULT_RECONNECT_POLICY,
    callbacks: Partial<ConnectionManagerCallbacks> = {},
  ) {
    this.callbacks = { ...NOOP_CALLBACKS, ...callbacks };
  }

  // ─── State ────────────────────────────────────────────────────────────────

  get state(): ConnectionState { return this._state; }

  is(state: ConnectionState): boolean { return this._state === state; }

  get reconnectAttempts(): number { return this._reconnectAttempts; }

  get connectedAt(): number | null { return this._connectedAt; }

  // ─── Transitions ──────────────────────────────────────────────────────────

  startConnecting(): void {
    this._transition('Connecting');
    this.logger.info('connection_connecting');
  }

  markConnected(): void {
    this._transition('Connected');
    this._connectedAt   = Date.now();
    this._reconnectAttempts = 0;
    this.logger.info('connection_connected');
    this.callbacks.onConnected();
  }

  markDisconnected(): void {
    this._transition('Disconnected');
    this._connectedAt = null;
    this.logger.info('connection_disconnected');
    this.callbacks.onDisconnected();
  }

  markAuthFailed(reason: string): void {
    this._transition('AuthenticationFailed');
    this.logger.warn('connection_auth_failed', { reason });
    this.callbacks.onAuthFailed(reason);
  }

  /**
   * Called when the connection drops unexpectedly.
   * Evaluates the reconnect policy and transitions to Reconnecting or Disconnected.
   * Returns the decision so callers can schedule the delay.
   */
  onConnectionLost(): ReconnectDecision {
    this._reconnectAttempts++;
    const decision = evaluateReconnect(this.reconnectPolicy, this._reconnectAttempts);

    if (decision.shouldReconnect) {
      this._transition('Reconnecting');
      this.logger.info('connection_reconnecting', {
        attempt: this._reconnectAttempts,
        delay_ms: decision.delayMs,
      });
      this.callbacks.onReconnecting(this._reconnectAttempts, decision.delayMs);
    } else {
      this._transition('Disconnected');
      this.logger.warn('connection_gave_up', {
        attempts: this._reconnectAttempts,
        max:      this.reconnectPolicy.maxAttempts,
      });
      this.callbacks.onDisconnected();
    }

    return decision;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _transition(to: ConnectionState): void {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed.includes(to)) {
      throw new IllegalConnectionTransitionError(this._state, to);
    }
    this._state = to;
    this.history.push(to);
  }
}
