// ─── WebSocket MCP Transport ──────────────────────────────────────────────────
// JSON-RPC 2.0 over the browser's native WebSocket API.
// Auth token (if any) is appended as ?token=<value> — browsers cannot set
// custom WebSocket headers during the handshake.
//
// Security:
//   - URL validated to ws:// or wss:// only
//   - Response size bounded to MAX_MESSAGE_BYTES (1 MiB)
//   - Per-request timeout with automatic pending-map cleanup
//   - Auth token never logged or included in error messages

import type { MCPTransportAdapter } from '../GenericMCPConnector';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject:  (reason: Error)  => void;
  timer:   ReturnType<typeof setTimeout>;
}

const MAX_MESSAGE_BYTES = 1_048_576; // 1 MiB

export class WebSocketMCPTransport implements MCPTransportAdapter {
  private _ws:              WebSocket | null = null;
  private readonly _pending = new Map<number, PendingRequest>();
  private _msgId            = 0;

  private readonly _url:     string;
  private readonly _timeout: number;

  constructor(url: string, options?: { authToken?: string; timeoutMs?: number }) {
    if (!/^wss?:\/\//i.test(url)) {
      throw new Error(
        `WebSocket MCP transport requires a ws:// or wss:// URL (got: ${url.slice(0, 40)})`,
      );
    }
    const u = new URL(url);
    if (options?.authToken) u.searchParams.set('token', options.authToken);
    this._url     = u.toString();
    this._timeout = options?.timeoutMs ?? 30_000;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const connectTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this._ws?.close();
          reject(new Error(`WebSocket MCP connection timed out (${this._timeout}ms)`));
        }
      }, this._timeout);

      this._ws = new WebSocket(this._url);

      this._ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimer);
        resolve();
      };

      this._ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimer);
        reject(new Error('WebSocket MCP connection failed'));
      };

      this._ws.onclose = (evt) => {
        clearTimeout(connectTimer);
        if (!settled) {
          settled = true;
          reject(new Error(`WebSocket closed during connect (code ${evt.code})`));
        }
        // Drain all pending requests
        for (const [id, req] of this._pending) {
          clearTimeout(req.timer);
          req.reject(new Error('WebSocket MCP disconnected'));
          this._pending.delete(id);
        }
      };

      this._ws.onmessage = (evt) => this._handleMessage(evt.data as string);
    });
  }

  async disconnect(): Promise<void> {
    this._ws?.close();
    this._ws = null;
  }

  isConnected(): boolean {
    return this._ws?.readyState === WebSocket.OPEN;
  }

  // ── JSON-RPC ──────────────────────────────────────────────────────────────────

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.isConnected()) {
      throw new Error(`WebSocket MCP not connected (method: ${method})`);
    }
    const id  = ++this._msgId;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MCP request '${method}' timed out after ${this._timeout}ms`));
      }, this._timeout);

      this._pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      try {
        this._ws!.send(msg);
      } catch (err) {
        clearTimeout(timer);
        this._pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (!this.isConnected()) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    try { this._ws!.send(msg); } catch { /* best-effort */ }
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  private _handleMessage(data: string): void {
    if (data.length > MAX_MESSAGE_BYTES) {
      console.warn(
        `[WebSocketMCPTransport] Response exceeds ${MAX_MESSAGE_BYTES} bytes — discarding`,
      );
      return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return; // malformed JSON — ignore silently
    }

    const id = msg['id'] as number | string | undefined;
    if (id == null) return; // JSON-RPC notification — no response expected

    const pending = this._pending.get(id as number);
    if (!pending) return;

    clearTimeout(pending.timer);
    this._pending.delete(id as number);

    if (msg['error']) {
      const rpcErr = msg['error'] as Record<string, unknown>;
      pending.reject(new Error((rpcErr['message'] as string | undefined) ?? 'JSON-RPC error'));
    } else {
      pending.resolve(msg['result']);
    }
  }
}
