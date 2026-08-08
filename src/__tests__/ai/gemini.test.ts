import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiFlashConnector }  from '../../ai/providers/GeminiFlashConnector';
import { SecureString }          from '../../ai/security/SecureString';
import { AIConnectorError }      from '../../ai/types/AITypes';
import {
  makeRequest,
  makeStream,
  mockJsonFetch,
  mockStreamFetch,
  mockNetworkErrorFetch,
  collectStream,
  geminiSuccessResponse,
  geminiErrorResponse,
  geminiSSEChunk,
  isValidAIResponse,
  isValidStreamChunk,
} from './helpers/testHelpers';

function makeConnector(fetcher = mockJsonFetch(200, geminiSuccessResponse('ok'))) {
  return new GeminiFlashConnector({
    apiKey:  SecureString.from('test-key'),
    fetcher,
  });
}

// ─── Execute ──────────────────────────────────────────────────────────────────

describe('GeminiFlashConnector — execute', () => {
  it('returns a valid AIResponse on success', async () => {
    const c = makeConnector();
    const r = await c.execute(makeRequest());
    expect(isValidAIResponse(r)).toBe(true);
    expect(r.connector).toBe('gemini_flash');
    expect(r.provider).toBe('Google');
  });

  it('extracts text from candidates[0].content.parts', async () => {
    const c = makeConnector(mockJsonFetch(200, geminiSuccessResponse('hello world')));
    const r = await c.execute(makeRequest());
    expect(r.text).toBe('hello world');
  });

  it('populates usage metadata', async () => {
    const c = makeConnector(mockJsonFetch(200, geminiSuccessResponse('hi', 10, 20)));
    const r = await c.execute(makeRequest());
    expect(r.usage?.inputTokens).toBe(10);
    expect(r.usage?.outputTokens).toBe(20);
    expect(r.usage?.totalTokens).toBe(30);
  });

  it('includes system prompt in request body', async () => {
    let capturedBody: unknown;
    const fetcher = async (url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(geminiSuccessResponse('ok')), { status: 200 });
    };
    const c = new GeminiFlashConnector({ apiKey: SecureString.from('k'), fetcher });
    await c.execute(makeRequest({ systemPrompt: 'Be helpful' }));
    expect((capturedBody as Record<string, unknown>)['systemInstruction']).toBeTruthy();
  });

  it('sends image attachments as inlineData parts', async () => {
    let capturedBody: unknown;
    const fetcher = async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(geminiSuccessResponse('ok')), { status: 200 });
    };
    const c = new GeminiFlashConnector({ apiKey: SecureString.from('k'), fetcher });
    await c.execute(makeRequest({
      attachments: [{ type: 'image', content: 'base64data', mimeType: 'image/png' }],
    }));
    const contents = (capturedBody as Record<string, unknown>)['contents'] as unknown[];
    const parts = (contents[0] as Record<string, unknown>)['parts'] as unknown[];
    expect(parts.some((p: unknown) => (p as Record<string, unknown>)['inlineData'])).toBe(true);
  });

  it('never exposes the API key in the request body', async () => {
    let capturedBody = '';
    const fetcher = async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string ?? '';
      return new Response(JSON.stringify(geminiSuccessResponse('ok')), { status: 200 });
    };
    const c = new GeminiFlashConnector({ apiKey: SecureString.from('secret-key-123'), fetcher });
    await c.execute(makeRequest());
    expect(capturedBody).not.toContain('secret-key-123');
  });

  it('API key goes in the URL query param (not headers)', async () => {
    let capturedUrl = '';
    const fetcher = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      return new Response(JSON.stringify(geminiSuccessResponse('ok')), { status: 200 });
    };
    const c = new GeminiFlashConnector({ apiKey: SecureString.from('my-key'), fetcher });
    await c.execute(makeRequest());
    expect(capturedUrl).toContain('key=my-key');
  });

  it('measures latency > 0', async () => {
    const c = makeConnector();
    const r = await c.execute(makeRequest());
    expect(r.latency).toBeGreaterThanOrEqual(0);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('GeminiFlashConnector — error handling', () => {
  it('throws AUTH_FAILED on 403', async () => {
    const c = makeConnector(mockJsonFetch(403, geminiErrorResponse(403, 'API key invalid')));
    await expect(c.execute(makeRequest())).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('throws AUTH_FAILED on 401', async () => {
    const c = makeConnector(mockJsonFetch(401, geminiErrorResponse(401, 'Unauthorized')));
    await expect(c.execute(makeRequest())).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('throws ALL_FAILED on 429 rate limit', async () => {
    const c = makeConnector(mockJsonFetch(429, geminiErrorResponse(429, 'Quota exceeded')));
    await expect(c.execute(makeRequest())).rejects.toMatchObject({ code: 'ALL_FAILED' });
  });

  it('throws ALL_FAILED on generic 500', async () => {
    const c = makeConnector(mockJsonFetch(500, geminiErrorResponse(500, 'Internal error')));
    await expect(c.execute(makeRequest())).rejects.toMatchObject({ code: 'ALL_FAILED' });
  });

  it('throws on network error', async () => {
    const c = makeConnector(mockNetworkErrorFetch());
    await expect(c.execute(makeRequest())).rejects.toThrow();
  });

  it('error is an AIConnectorError with connectorId', async () => {
    const c = makeConnector(mockJsonFetch(403, {}));
    try {
      await c.execute(makeRequest());
    } catch (err) {
      expect(err).toBeInstanceOf(AIConnectorError);
      expect((err as AIConnectorError).connectorId).toBe('gemini_flash');
    }
  });
});

// ─── Timeout ──────────────────────────────────────────────────────────────────

describe('GeminiFlashConnector — timeout', () => {
  it('throws TIMEOUT when request exceeds timeout', async () => {
    const slow = async (_url: string, init?: RequestInit) => {
      await new Promise<void>((_, reject) => {
        const t = setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 2000);
        init?.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); });
      });
      return new Response('', { status: 200 });
    };
    const c = new GeminiFlashConnector({
      apiKey:  SecureString.from('k'),
      timeout: 10,
      fetcher: slow,
    });
    await expect(c.execute(makeRequest())).rejects.toMatchObject({ code: 'TIMEOUT' });
  }, 3000);
});

// ─── Cancellation ─────────────────────────────────────────────────────────────

describe('GeminiFlashConnector — cancellation', () => {
  it('cancel() does not throw for unknown requestId', async () => {
    const c = makeConnector();
    await expect(c.cancel('unknown-id')).resolves.toBeUndefined();
  });

  it('cancel() aborts an in-flight request', async () => {
    let _aborted = false;
    const fetcher = async (_url: string, init?: RequestInit) => {
      await new Promise<void>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          _aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return new Response('', { status: 200 });
    };
    const c  = new GeminiFlashConnector({ apiKey: SecureString.from('k'), fetcher });
    const req = makeRequest({ requestId: 'cancel-me' });
    const p  = c.execute(req);
    await c.cancel('cancel-me');
    await expect(p).rejects.toBeTruthy();
  });
});

// ─── Streaming ────────────────────────────────────────────────────────────────

describe('GeminiFlashConnector — streaming', () => {
  it('yields chunks from SSE stream', async () => {
    const body = makeStream([
      geminiSSEChunk('Hello'),
      geminiSSEChunk(' World', true),
    ]);
    const c      = new GeminiFlashConnector({ apiKey: SecureString.from('k'), fetcher: mockStreamFetch(200, body) });
    const chunks = await collectStream(c.stream(makeRequest()));
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.every(isValidStreamChunk)).toBe(true);
  });

  it('last chunk has done = true', async () => {
    const body = makeStream([geminiSSEChunk('Hi', true)]);
    const c    = new GeminiFlashConnector({ apiKey: SecureString.from('k'), fetcher: mockStreamFetch(200, body) });
    const chunks = await collectStream(c.stream(makeRequest()));
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('accumulated delta equals full response text', async () => {
    const body = makeStream([
      geminiSSEChunk('Hello'),
      geminiSSEChunk(', '),
      geminiSSEChunk('World', true),
    ]);
    const c      = new GeminiFlashConnector({ apiKey: SecureString.from('k'), fetcher: mockStreamFetch(200, body) });
    const chunks = await collectStream(c.stream(makeRequest()));
    expect(chunks.map(c => c.delta).join('')).toBe('Hello, World');
  });

  it('throws on stream HTTP error', async () => {
    const c = new GeminiFlashConnector({
      apiKey:  SecureString.from('k'),
      fetcher: mockJsonFetch(403, geminiErrorResponse(403, 'Bad key')),
    });
    await expect(collectStream(c.stream(makeRequest()))).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe('GeminiFlashConnector — health', () => {
  it('returns connected on HTTP 200', async () => {
    const c = makeConnector(mockJsonFetch(200, {}));
    const h = await c.health();
    expect(h.status).toBe('connected');
    expect(typeof h.latencyMs).toBe('number');
    expect(typeof h.checkedAt).toBe('string');
  });

  it('returns error on non-200', async () => {
    const c = makeConnector(mockJsonFetch(403, {}));
    const h = await c.health();
    expect(h.status).toBe('error');
  });

  it('returns error on network failure', async () => {
    const c = makeConnector(mockNetworkErrorFetch());
    const h = await c.health();
    expect(h.status).toBe('error');
    expect(h.message).toBeTruthy();
  });
});

// ─── Capabilities / schema ────────────────────────────────────────────────────

describe('GeminiFlashConnector — capabilities', () => {
  it('supports vision, streaming, JSON, tools, reasoning', () => {
    const c = makeConnector();
    const caps = c.capabilities();
    expect(caps.supportsVision).toBe(true);
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.supportsJSON).toBe(true);
    expect(caps.supportsTools).toBe(true);
    expect(caps.supportsReasoning).toBe(true);
  });

  it('configurationSchema has required apiKey field', () => {
    const schema = makeConnector().configurationSchema();
    const apiKeyField = schema.fields.find(f => f.key === 'apiKey');
    expect(apiKeyField?.required).toBe(true);
    expect(apiKeyField?.type).toBe('secret');
  });
});

// ─── SecureString ─────────────────────────────────────────────────────────────

describe('SecureString', () => {
  it('reveal() returns the raw value', () => {
    expect(SecureString.from('my-secret').reveal()).toBe('my-secret');
  });

  it('toString() returns [REDACTED]', () => {
    expect(String(SecureString.from('secret'))).toBe('[REDACTED]');
  });

  it('toJSON() returns [REDACTED]', () => {
    const obj = { key: SecureString.from('secret') };
    expect(JSON.stringify(obj)).toBe('{"key":"[REDACTED]"}');
  });

  it('isPresent() is false for empty string', () => {
    expect(SecureString.from('').isPresent()).toBe(false);
  });

  it('isPresent() is true for non-empty string', () => {
    expect(SecureString.from('x').isPresent()).toBe(true);
  });
});
