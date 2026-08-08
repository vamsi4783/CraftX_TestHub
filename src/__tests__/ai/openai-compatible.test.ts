import { describe, it, expect } from 'vitest';
import { OpenAICompatibleConnector } from '../../ai/providers/OpenAICompatibleConnector';
import { SecureString }              from '../../ai/security/SecureString';
import { AIConnectorError }          from '../../ai/types/AITypes';
import {
  makeRequest,
  makeStream,
  mockJsonFetch,
  mockStreamFetch,
  mockNetworkErrorFetch,
  collectStream,
  oaiSuccessResponse,
  oaiStreamChunk,
  isValidAIResponse,
  isValidStreamChunk,
} from './helpers/testHelpers';

function makeConnector(fetcher = mockJsonFetch(200, oaiSuccessResponse('ok'))) {
  return new OpenAICompatibleConnector({
    id:      'test-oai',
    name:    'TestOAI',
    baseUrl: 'http://localhost:1234/v1',
    model:   'my-model',
    fetcher,
  });
}

function makeAuthConnector(fetcher = mockJsonFetch(200, oaiSuccessResponse('ok'))) {
  return new OpenAICompatibleConnector({
    id:      'groq',
    name:    'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model:   'llama3-70b-8192',
    apiKey:  SecureString.from('gsk_test'),
    fetcher,
  });
}

// ─── Execute ──────────────────────────────────────────────────────────────────

describe('OpenAICompatibleConnector — execute', () => {
  it('returns a valid AIResponse on success', async () => {
    const r = await makeConnector().execute(makeRequest());
    expect(isValidAIResponse(r)).toBe(true);
  });

  it('extracts content from choices[0].message.content', async () => {
    const r = await makeConnector(mockJsonFetch(200, oaiSuccessResponse('hello oai'))).execute(makeRequest());
    expect(r.text).toBe('hello oai');
  });

  it('populates usage from response', async () => {
    const r = await makeConnector().execute(makeRequest());
    expect(r.usage?.inputTokens).toBe(5);
    expect(r.usage?.outputTokens).toBe(10);
    expect(r.usage?.totalTokens).toBe(15);
  });

  it('hits /chat/completions endpoint', async () => {
    let capturedUrl = '';
    const fetcher = async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify(oaiSuccessResponse('ok')), { status: 200 });
    };
    await new OpenAICompatibleConnector({
      id: 'x', name: 'X', baseUrl: 'http://srv/v1', model: 'm', fetcher,
    }).execute(makeRequest());
    expect(capturedUrl).toBe('http://srv/v1/chat/completions');
  });

  it('sends Authorization header when apiKey provided', async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetcher = async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string> ?? {};
      return new Response(JSON.stringify(oaiSuccessResponse('ok')), { status: 200 });
    };
    await makeAuthConnector(fetcher).execute(makeRequest());
    expect(capturedHeaders['Authorization']).toBe('Bearer gsk_test');
  });

  it('sends no Authorization header when no apiKey', async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetcher = async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string> ?? {};
      return new Response(JSON.stringify(oaiSuccessResponse('ok')), { status: 200 });
    };
    await makeConnector(fetcher).execute(makeRequest());
    expect(capturedHeaders['Authorization']).toBeUndefined();
  });

  it('includes system prompt as role:system message', async () => {
    let capturedBody: unknown;
    const fetcher = async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(oaiSuccessResponse('ok')), { status: 200 });
    };
    await new OpenAICompatibleConnector({
      id: 'x', name: 'X', baseUrl: 'http://srv/v1', model: 'm', fetcher,
    }).execute(makeRequest({ systemPrompt: 'Be precise' }));
    const msgs = (capturedBody as Record<string, unknown>)['messages'] as Array<Record<string, unknown>>;
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe('Be precise');
  });

  it('custom endpoint is used verbatim', async () => {
    let capturedUrl = '';
    const fetcher = async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify(oaiSuccessResponse('ok')), { status: 200 });
    };
    await new OpenAICompatibleConnector({
      id: 'vllm', name: 'vLLM', baseUrl: 'http://gpu-server:8000/v1', model: 'mistral-7b', fetcher,
    }).execute(makeRequest());
    expect(capturedUrl).toContain('gpu-server:8000');
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('OpenAICompatibleConnector — error handling', () => {
  it('throws AUTH_FAILED on 401', async () => {
    const c = makeConnector(mockJsonFetch(401, { error: { message: 'Unauthorized' } }));
    await expect(c.execute(makeRequest())).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('throws AUTH_FAILED on 403', async () => {
    const c = makeConnector(mockJsonFetch(403, { error: { message: 'Forbidden' } }));
    await expect(c.execute(makeRequest())).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('throws ALL_FAILED on 429 rate limit', async () => {
    const c = makeConnector(mockJsonFetch(429, { error: { message: 'Rate limit' } }));
    await expect(c.execute(makeRequest())).rejects.toMatchObject({ code: 'ALL_FAILED' });
  });

  it('throws on malformed (non-JSON) response', async () => {
    const fetcher = async () => new Response('not-json', { status: 200 });
    const c = new OpenAICompatibleConnector({
      id: 'x', name: 'X', baseUrl: 'http://srv/v1', model: 'm', fetcher,
    });
    await expect(c.execute(makeRequest())).rejects.toThrow();
  });

  it('throws on network error', async () => {
    const c = makeConnector(mockNetworkErrorFetch());
    await expect(c.execute(makeRequest())).rejects.toThrow();
  });

  it('error is AIConnectorError with connectorId', async () => {
    const c = makeConnector(mockJsonFetch(401, {}));
    try {
      await c.execute(makeRequest());
    } catch (err) {
      expect(err).toBeInstanceOf(AIConnectorError);
      expect((err as AIConnectorError).connectorId).toBe('test-oai');
    }
  });
});

// ─── Retry (orchestrator layer — connector-level: just throws) ────────────────

describe('OpenAICompatibleConnector — retry readiness', () => {
  it('throws consistently on every failed call (idempotent for retry)', async () => {
    let count = 0;
    const fetcher = async () => {
      count++;
      return new Response('{}', { status: 500 });
    };
    const c = new OpenAICompatibleConnector({
      id: 'x', name: 'X', baseUrl: 'http://srv/v1', model: 'm', fetcher,
    });
    await expect(c.execute(makeRequest())).rejects.toBeTruthy();
    await expect(c.execute(makeRequest())).rejects.toBeTruthy();
    expect(count).toBe(2);
  });
});

// ─── Streaming ────────────────────────────────────────────────────────────────

describe('OpenAICompatibleConnector — streaming', () => {
  it('yields chunks from SSE stream', async () => {
    const body = makeStream([
      oaiStreamChunk('Hello'),
      oaiStreamChunk(' world'),
      oaiStreamChunk('', true),
    ]);
    const c      = new OpenAICompatibleConnector({
      id: 'x', name: 'X', baseUrl: 'http://srv/v1', model: 'm',
      fetcher: mockStreamFetch(200, body),
    });
    const chunks = await collectStream(c.stream(makeRequest()));
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.every(isValidStreamChunk)).toBe(true);
  });

  it('last chunk has done = true', async () => {
    const body = makeStream([oaiStreamChunk('hi'), oaiStreamChunk('', true)]);
    const c    = new OpenAICompatibleConnector({
      id: 'x', name: 'X', baseUrl: 'http://srv/v1', model: 'm',
      fetcher: mockStreamFetch(200, body),
    });
    const chunks = await collectStream(c.stream(makeRequest()));
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('throws on stream HTTP error', async () => {
    const c = new OpenAICompatibleConnector({
      id: 'x', name: 'X', baseUrl: 'http://srv/v1', model: 'm',
      fetcher: mockJsonFetch(401, {}),
    });
    await expect(collectStream(c.stream(makeRequest()))).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe('OpenAICompatibleConnector — health', () => {
  it('returns connected when /models responds 200', async () => {
    const c = makeConnector(mockJsonFetch(200, { data: [] }));
    expect((await c.health()).status).toBe('connected');
  });

  it('returns error when endpoint is down', async () => {
    const c = makeConnector(mockNetworkErrorFetch());
    expect((await c.health()).status).toBe('error');
  });
});

// ─── Cancellation ─────────────────────────────────────────────────────────────

describe('OpenAICompatibleConnector — cancellation', () => {
  it('cancel() does not throw for unknown requestId', async () => {
    await expect(makeConnector().cancel('noop')).resolves.toBeUndefined();
  });
});

// ─── Config flexibility ───────────────────────────────────────────────────────

describe('OpenAICompatibleConnector — multi-vendor config', () => {
  const vendors = [
    { id: 'lm_studio', name: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: 'phi-3' },
    { id: 'groq',      name: 'Groq',      baseUrl: 'https://api.groq.com/openai/v1', model: 'llama3' },
    { id: 'openrouter',name: 'OpenRouter',baseUrl: 'https://openrouter.ai/api/v1', model: 'auto' },
    { id: 'together',  name: 'Together',  baseUrl: 'https://api.together.xyz/v1', model: 'mistral' },
    { id: 'vllm',      name: 'vLLM',      baseUrl: 'http://gpu:8000/v1', model: 'llama3' },
  ];

  for (const v of vendors) {
    it(`${v.name} connector builds and returns valid response`, async () => {
      const c = new OpenAICompatibleConnector({
        ...v,
        fetcher: mockJsonFetch(200, oaiSuccessResponse('hi')),
      });
      const r = await c.execute(makeRequest());
      expect(isValidAIResponse(r)).toBe(true);
      expect(r.connector).toBe(v.id);
    });
  }
});
