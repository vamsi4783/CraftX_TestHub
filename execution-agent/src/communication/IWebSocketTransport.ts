// ─── IWebSocketTransport ──────────────────────────────────────────────────────
// Abstraction over a single WebSocket connection.
// Injected into AgentServer — real impl wraps `ws`; test impl is ManualTransport.

export type TransportReadyState = 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';

export interface TransportCallbacks {
  onOpen:    ()                             => void;
  onMessage: (data: string)                 => void;
  onClose:   (code: number, reason: string) => void;
  onError:   (err: Error)                   => void;
}

export interface IWebSocketTransport {
  readonly readyState: TransportReadyState;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** Factory that creates a transport and wires callbacks before returning it. */
export interface ITransportFactory {
  create(url: string, callbacks: TransportCallbacks): IWebSocketTransport;
}
