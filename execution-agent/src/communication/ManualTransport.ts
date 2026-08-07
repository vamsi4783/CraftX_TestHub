// ─── ManualTransport ──────────────────────────────────────────────────────────
// In-memory IWebSocketTransport for unit tests.
// Tests drive it by calling simulateOpen/Close/Message/Error.

import type {
  ITransportFactory,
  IWebSocketTransport,
  TransportCallbacks,
  TransportReadyState,
} from './IWebSocketTransport.js';

export class ManualTransport implements IWebSocketTransport {
  private _readyState: TransportReadyState = 'CONNECTING';
  private _callbacks: TransportCallbacks | null = null;

  /** Messages sent by AgentServer → captured for assertions. */
  readonly sent: string[] = [];
  /** close() call args captured for assertions. */
  closeCalls: Array<{ code?: number; reason?: string }> = [];

  get readyState(): TransportReadyState { return this._readyState; }

  _attach(callbacks: TransportCallbacks): void {
    this._callbacks = callbacks;
  }

  // ─── IWebSocketTransport ──────────────────────────────────────────────────

  send(data: string): void {
    if (this._readyState !== 'OPEN') {
      throw new Error(`ManualTransport.send() called in state ${this._readyState}`);
    }
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this._readyState = 'CLOSING';
  }

  // ─── Test helpers ─────────────────────────────────────────────────────────

  simulateOpen(): void {
    this._readyState = 'OPEN';
    this._callbacks?.onOpen();
  }

  simulateMessage(data: string): void {
    this._callbacks?.onMessage(data);
  }

  simulateClose(code = 1000, reason = ''): void {
    this._readyState = 'CLOSED';
    this._callbacks?.onClose(code, reason);
  }

  simulateError(err: Error): void {
    this._callbacks?.onError(err);
  }
}

/** Factory that creates a ManualTransport and lets tests access it. */
export class ManualTransportFactory implements ITransportFactory {
  private _last: ManualTransport | null = null;

  get last(): ManualTransport {
    if (!this._last) throw new Error('No transport created yet');
    return this._last;
  }

  create(_url: string, callbacks: TransportCallbacks): IWebSocketTransport {
    const t = new ManualTransport();
    t._attach(callbacks);
    this._last = t;
    return t;
  }
}
