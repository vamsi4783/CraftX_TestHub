// ─── HTTP MCP Transport (Streamable HTTP) ────────────────────────────────────
// JSON-RPC 2.0 over HTTP POST — implements the MCP Streamable HTTP transport
// (spec 2025-03-26).  Each request is a POST; responses are plain JSON.
//
// Use this for MCP servers configured with transport type "sse".  The original
// SSE transport (persistent EventSource + separate POST channel) is not
// supported; the Streamable HTTP variant works with modern MCP servers and is
// far simpler to implement correctly in a browser context.
//
// Security:
//   - URL validated to http:// or https:// only
//   - Response size bounded to MAX_RESPONSE_BYTES (1 MiB)
//   - Per-request timeout via AbortController
//   - Auth token sent as "Authorization: Bearer …" header — never in URL or body

import type { MCPTransportAdapter } from '../GenericMCPConnector';

const MAX_RESPONSE_BYTES = 1_048_576; // 1 MiB

export class HttpMCPTransport implements MCPTransportAdapter {
  private _connected                = false;
  private readonly _url:     string;
  private readonly _headers: Record<string, string>;
  private readonly _timeout: number;

  constructor(url: string, options?: { authToken?: string; timeoutMs?: number }) {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(
        `HTTP MCP transport requires an http:// or https:// URL (got: ${url.slice(0, 40)})`,
      );
    }
    this._url     = url.replace(/\/$/, '');
    this._timeout = options?.timeoutMs ?? 30_000;
    this._headers = {
      'Content-Type': 'application/json',
      'Accept':       'application/json, text/event-stream',
    };
    if (options?.authToken) {
      this._headers['Authorization'] = `Bearer ${options.authToken}`;
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    // Verify reachability.  MCP "ping" is optional — some servers don't implement
    // it, so we tolerate a NOT_IMPLEMENTED response and treat it as "reachable".
    try {
      await this._post('ping', undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "Method not found" / NOT_IMPLEMENTED means server is up but ping is optional
      if (/not.?found|not.?implement|method.*unknown/i.test(msg)) {
        this._connected = true;
        return;
      }
      throw new Error(`HTTP MCP server unreachable: ${msg}`);
    }
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  // ── JSON-RPC ──────────────────────────────────────────────────────────────────

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    return this._post<T>(method, params);
  }

  async notify(method: string, params?: unknown): Promise<void> {
    // Fire-and-forget — ignore errors
    fetch(this._url, {
      method:  'POST',
      headers: this._headers,
      body:    JSON.stringify({ jsonrpc: '2.0', method, params }),
    }).catch(() => { /* best-effort */ });
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  private async _post<T>(method: string, params: unknown): Promise<T> {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this._timeout);

    try {
      const resp = await fetch(this._url, {
        method:  'POST',
        headers: this._headers,
        body:    JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        signal:  controller.signal,
      });

      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
      }

      const text = await resp.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new Error(
          `MCP response exceeds maximum size (${MAX_RESPONSE_BYTES} bytes)`,
        );
      }

      const data = JSON.parse(text) as Record<string, unknown>;
      if (data['error']) {
        const rpcErr = data['error'] as Record<string, unknown>;
        throw new Error((rpcErr['message'] as string | undefined) ?? 'JSON-RPC error');
      }
      return data['result'] as T;

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`MCP request '${method}' timed out after ${this._timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
