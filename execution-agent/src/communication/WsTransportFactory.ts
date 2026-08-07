// ─── WsTransportFactory ───────────────────────────────────────────────────────
// Production ITransportFactory that wraps the `ws` package.
// Not used in unit tests — tests inject ManualTransport directly.

import WebSocket from 'ws';
import type {
  ITransportFactory,
  IWebSocketTransport,
  TransportCallbacks,
  TransportReadyState,
} from './IWebSocketTransport.js';

class WsTransport implements IWebSocketTransport {
  constructor(private readonly ws: WebSocket) {}

  get readyState(): TransportReadyState {
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN:       return 'OPEN';
      case WebSocket.CLOSING:    return 'CLOSING';
      case WebSocket.CLOSED:     return 'CLOSED';
      default:                   return 'CLOSED';
    }
  }

  send(data: string): void {
    this.ws.send(data);
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }
}

export const WS_TRANSPORT_FACTORY: ITransportFactory = {
  create(url: string, callbacks: TransportCallbacks): IWebSocketTransport {
    const ws = new WebSocket(url);

    ws.on('open',    ()           => callbacks.onOpen());
    ws.on('message', (raw)        => callbacks.onMessage(raw.toString()));
    ws.on('close',   (code, buf)  => callbacks.onClose(code, buf.toString()));
    ws.on('error',   (err)        => callbacks.onError(err));

    return new WsTransport(ws);
  },
};
