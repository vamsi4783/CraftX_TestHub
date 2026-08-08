/**
 * mcp-transport.test.ts — deterministic unit tests for WebSocketMCPTransport
 * and HttpMCPTransport.
 *
 * Neither test requires a real server. WebSocket is mocked with a minimal
 * in-memory class; HTTP uses vi.stubGlobal('fetch', …).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpMCPTransport }      from '@/ai/agents/transports/HttpMCPTransport';
import { WebSocketMCPTransport } from '@/ai/agents/transports/WebSocketMCPTransport';

// ─── Mock WebSocket ────────────────────────────────────────────────────────────

type WSHandler = (this: MockWebSocket, ev: unknown) => void;

class MockWebSocket {
  static OPEN    = 1;
  static CLOSED  = 3;

  readyState    = MockWebSocket.OPEN;
  onopen:  WSHandler | null = null;
  onerror: WSHandler | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;

  readonly sentMessages: string[] = [];

  constructor(public readonly url: string) {
    // Simulate async open
    Promise.resolve().then(() => this.onopen?.call(this, {}));
  }

  send(data: string) { this.sentMessages.push(data); }
  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000 });
  }

  /** Test helper: push a JSON-RPC response back to the transport. */
  respond(id: number, result: unknown) {
    this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, result }) });
  }

  /** Test helper: push a JSON-RPC error back to the transport. */
  respondError(id: number, message: string) {
    this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } }) });
  }
}

// ─── HttpMCPTransport tests ───────────────────────────────────────────────────

describe('HttpMCPTransport', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  function makeFetch(result: unknown, status = 200) {
    return vi.fn().mockResolvedValue({
      ok:   status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: 1, result })),
    });
  }

  beforeEach(() => {
    mockFetch = makeFetch({ ok: true });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects non-http URL in constructor', () => {
    expect(() => new HttpMCPTransport('ws://localhost:3000')).toThrow(/http/i);
  });

  it('accepts http:// URL', () => {
    expect(() => new HttpMCPTransport('http://localhost:3000')).not.toThrow();
  });

  it('accepts https:// URL', () => {
    expect(() => new HttpMCPTransport('https://example.com')).not.toThrow();
  });

  it('connect() returns connected after successful ping', async () => {
    const t = new HttpMCPTransport('http://localhost:3000');
    expect(t.isConnected()).toBe(false);
    await t.connect();
    expect(t.isConnected()).toBe(true);
  });

  it('connect() treats Method not found as success', async () => {
    // Some servers don't implement ping — treat as reachable
    mockFetch = vi.fn().mockResolvedValue({
      ok:   true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        jsonrpc: '2.0', id: 1,
        error: { code: -32601, message: 'Method not found' },
      })),
    });
    vi.stubGlobal('fetch', mockFetch);
    const t = new HttpMCPTransport('http://localhost:3000');
    await t.connect();
    expect(t.isConnected()).toBe(true);
  });

  it('connect() throws on unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const t = new HttpMCPTransport('http://localhost:3000');
    await expect(t.connect()).rejects.toThrow(/unreachable/i);
  });

  it('disconnect() sets isConnected to false', async () => {
    const t = new HttpMCPTransport('http://localhost:3000');
    await t.connect();
    await t.disconnect();
    expect(t.isConnected()).toBe(false);
  });

  it('request() sends correct JSON-RPC payload', async () => {
    const t = new HttpMCPTransport('http://localhost:3000');
    await t.connect();
    await t.request('tools/list');
    const body = JSON.parse((mockFetch.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('tools/list');
  });

  it('request() resolves with result field', async () => {
    vi.stubGlobal('fetch', makeFetch({ tools: ['echo'] }));
    const t = new HttpMCPTransport('http://localhost:3000');
    await t.connect();
    const res = await t.request<{ tools: string[] }>('tools/list');
    expect(res.tools).toEqual(['echo']);
  });

  it('request() throws on JSON-RPC error', async () => {
    const t = new HttpMCPTransport('http://localhost:3000');
    await t.connect(); // succeeds with default mock
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Invalid Request' },
      })),
    }));
    await expect(t.request('bad/method')).rejects.toThrow('Invalid Request');
  });

  it('request() throws on HTTP 401', async () => {
    const t = new HttpMCPTransport('http://localhost:3000');
    await t.connect(); // succeeds with default mock
    // Now make subsequent requests fail with 401
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    }));
    await expect(t.request('ping')).rejects.toThrow(/401/);
  });

  it('includes Authorization header when authToken provided', async () => {
    const t = new HttpMCPTransport('http://localhost:3000', { authToken: 'secret-token' });
    await t.connect();
    await t.request('ping');
    const headers = (mockFetch.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer secret-token');
  });

  it('does not include Authorization header when no authToken', async () => {
    const t = new HttpMCPTransport('http://localhost:3000');
    await t.connect();
    await t.request('ping');
    const headers = (mockFetch.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('authToken never appears in error messages', async () => {
    const t = new HttpMCPTransport('http://localhost:3000', { authToken: 'my-secret-bearer-token' });
    // Connect succeeds, then fail on the real request
    await t.connect();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    try {
      await t.request('ping');
    } catch (err) {
      expect(String(err)).not.toContain('my-secret-bearer-token');
    }
  });

  it('notify() fires and forgets (no throw)', async () => {
    const t = new HttpMCPTransport('http://localhost:3000');
    await t.connect();
    await expect(t.notify('event/log', { msg: 'hi' })).resolves.toBeUndefined();
  });
});

// ─── WebSocketMCPTransport tests ──────────────────────────────────────────────

describe('WebSocketMCPTransport', () => {
  let lastWS: MockWebSocket;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        lastWS = this;
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects non-ws URL in constructor', () => {
    expect(() => new WebSocketMCPTransport('http://localhost:3000')).toThrow(/ws/i);
  });

  it('accepts ws:// URL', () => {
    expect(() => new WebSocketMCPTransport('ws://localhost:3000')).not.toThrow();
  });

  it('accepts wss:// URL', () => {
    expect(() => new WebSocketMCPTransport('wss://localhost:3000')).not.toThrow();
  });

  it('appends auth token as query param', async () => {
    const t = new WebSocketMCPTransport('ws://localhost:3000', { authToken: 'tok' });
    await t.connect();
    expect(lastWS.url).toContain('token=tok');
  });

  it('does not append token param when no auth', async () => {
    const t = new WebSocketMCPTransport('ws://localhost:3000');
    await t.connect();
    expect(lastWS.url).not.toContain('token=');
  });

  it('connect() resolves when WebSocket opens', async () => {
    const t = new WebSocketMCPTransport('ws://localhost:3000');
    await expect(t.connect()).resolves.toBeUndefined();
  });

  it('isConnected() returns true after connect', async () => {
    const t = new WebSocketMCPTransport('ws://localhost:3000');
    await t.connect();
    expect(t.isConnected()).toBe(true);
  });

  it('disconnect() closes the socket', async () => {
    const t = new WebSocketMCPTransport('ws://localhost:3000');
    await t.connect();
    await t.disconnect();
    expect(t.isConnected()).toBe(false);
  });

  it('request() sends and receives JSON-RPC message', async () => {
    const t = new WebSocketMCPTransport('ws://localhost:3000');
    await t.connect();

    const promise = t.request<{ tools: string[] }>('tools/list');
    const sent    = JSON.parse(lastWS.sentMessages[0]);
    expect(sent.jsonrpc).toBe('2.0');
    expect(sent.method).toBe('tools/list');

    lastWS.respond(sent.id, { tools: ['echo'] });
    const res = await promise;
    expect(res.tools).toEqual(['echo']);
  });

  it('request() rejects on JSON-RPC error response', async () => {
    const t = new WebSocketMCPTransport('ws://localhost:3000');
    await t.connect();

    const promise = t.request('fail');
    const sent    = JSON.parse(lastWS.sentMessages[0]);
    lastWS.respondError(sent.id, 'Method not found');
    await expect(promise).rejects.toThrow('Method not found');
  });

  it('pending requests are rejected on disconnect', async () => {
    const t = new WebSocketMCPTransport('ws://localhost:3000');
    await t.connect();

    const promise = t.request('slow/method');
    lastWS.close();
    await expect(promise).rejects.toThrow(/disconnect/i);
  });

  it('auth token does not appear in any thrown error message', async () => {
    vi.stubGlobal('WebSocket', class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        lastWS = this;
        // Simulate immediate error
        Promise.resolve().then(() => {
          this.readyState = MockWebSocket.CLOSED;
          this.onerror?.call(this, {});
        });
      }
    });
    const t = new WebSocketMCPTransport('ws://localhost:3000', { authToken: 'supersecret' });
    try {
      await t.connect();
    } catch (err) {
      expect(String(err)).not.toContain('supersecret');
    }
  });

  it('oversized message is silently discarded', async () => {
    const t = new WebSocketMCPTransport('ws://localhost:3000');
    await t.connect();

    const promise = t.request<string>('echo');
    const sent    = JSON.parse(lastWS.sentMessages[0]);

    // Push oversized data — should be discarded (promise stays pending)
    const huge = 'x'.repeat(1_048_577);
    lastWS.onmessage?.({ data: huge });

    // Now push the real response
    lastWS.respond(sent.id, 'hello');
    await expect(promise).resolves.toBe('hello');
  });
});
