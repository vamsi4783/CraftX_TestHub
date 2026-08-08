import { describe, it, expect } from 'vitest';
import { OllamaConnector }  from '../../ai/providers/OllamaConnector';
import { AIConnectorError } from '../../ai/types/AITypes';
import {
  makeRequest,
  makeStream,
  mockJsonFetch,
  mockStreamFetch,
  mockNetworkErrorFetch,
  collectStream,
  ollamaSuccessResponse,
  ollamaStreamChunk,
  isValidAIResponse,
  isValidStreamChunk,
} from './helpers/testHelpers';

function makeConnector(fetcher = mockJsonFetch(200, ollamaSuccessResponse('ok'))) {
  return new OllamaConnector({ model: 'llama3.2', fetcher });
}

// ─── Execute ──────────────────────────────────────────────────────────────────

describe('OllamaConnector — execute', () => {
  it('returns a valid AIResponse on success', async () => {
    const r = await makeConnector().execute(makeRequest());
    expect(isValidAIResponse(r)).toBe(true);
    expect(r.provider).toBe('Ollama');
  });

  it('extracts content from message.content', async () => {
    const r = await makeConnector(mockJsonFetch(200, ollamaSuccessResponse('hello ollama'))).execute(makeRequest());
    expect(r.text).toBe('hello ollama');
  });

  it('populates usage from eval_count / prompt_eval_count', async () => {
    const r = await makeConnector().execute(makeRequest());
    expect(r.usage?.inputTokens).toBe(10);
    expect(r.usage?.outputTokens).toBe(20);
    expect(r.usage?.totalTokens).toBe(30);
  });

  it('uses default endpoint when none configured', async () => {
    let capturedUrl = '';
    const fetcher = async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify(ollamaSuccessResponse('ok')), { status: 200 });
    };
    const c = new OllamaConnector({ model: 'llama3.2', fetcher });
    await c.execute(makeRequest());
    expect(capturedUrl).toContain('localhost:11434');
  });

  it('uses custom endpoint when configured', async () => {
    let capturedUrl = '';
    const fetcher = async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify(ollamaSuccessResponse('ok')), { status: 200 });
    };
    const c = new OllamaConnector({ model: 'llama3.2', endpoint: 'http://myserver:11434', fetcher });
    await c.execute(makeRequest());
    expect(capturedUrl).toContain('myserver:11434');
  });

  it('includes system prompt as a system message', async () => {
    let capturedBody: unknown;
    const fetcher = async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(ollamaSuccessResponse('ok')), { status: 200 });
    };
    const c = new OllamaConnector({ model: 'llama3.2', fetcher });
    await c.execute(makeRequest({ systemPrompt: 'Be brief' }));
    const msgs = (capturedBody as Record<string, unknown>)['messages'] as Array<Record<string, unknown>>;
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe('Be brief');
  });

  it('sends stream: false for execute()', async () => {
    let capturedBody: unknown;
    const fetcher = async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(ollamaSuccessResponse('ok')), { status: 200 });
    };
    const c = new OllamaConnector({ model: 'llama3.2', fetcher });
    await c.execute(makeRequest());
    expect((capturedBody as Record<string, unknown>)['stream']).toBe(false);
  });

  it('measures latency', async () => {
    const r = await makeConnector().execute(makeRequest());
    expect(r.latency).toBeGreaterThanOrEqual(0);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('OllamaConnector — error handling', () => {
  it('throws ALL_FAILED when Ollama returns non-200', async () => {
    const c = makeConnector(mockJsonFetch(500, { error: 'model not found' }));
    await expect(c.execute(makeRequest())).rejects.toMatchObject({ code: 'ALL_FAILED' });
  });

  it('throws when endpoint is unreachable', async () => {
    const c = new OllamaConnector({ model: 'llama3.2', fetcher: mockNetworkErrorFetch() });
    await expect(c.execute(makeRequest())).rejects.toThrow();
  });

  it('error carries connectorId', async () => {
    const c = makeConnector(mockJsonFetch(500, {}));
    try {
      await c.execute(makeRequest());
    } catch (err) {
      expect(err).toBeInstanceOf(AIConnectorError);
      expect((err as AIConnectorError).connectorId).toContain('ollama');
    }
  });
});

// ─── Timeout ──────────────────────────────────────────────────────────────────

describe('OllamaConnector — timeout', () => {
  it('throws TIMEOUT when response takes too long', async () => {
    const slow = async (_url: string, init?: RequestInit) => {
      await new Promise<void>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')));
      });
      return new Response('', { status: 200 });
    };
    const c = new OllamaConnector({ model: 'llama3.2', timeout: 10, fetcher: slow });
    await expect(c.execute(makeRequest())).rejects.toMatchObject({ code: 'TIMEOUT' });
  }, 3000);
});

// ─── Model discovery ──────────────────────────────────────────────────────────

describe('OllamaConnector — model discovery', () => {
  it('listModels() returns available models from /api/tags', async () => {
    const c = new OllamaConnector({
      model:   'llama3.2',
      fetcher: mockJsonFetch(200, { models: [{ name: 'llama3.2' }, { name: 'mistral' }] }),
    });
    const models = await c.listModels();
    expect(models).toContain('llama3.2');
    expect(models).toContain('mistral');
  });

  it('listModels() falls back to configured model when endpoint unreachable', async () => {
    const c = new OllamaConnector({ model: 'llama3.2', fetcher: mockNetworkErrorFetch() });
    const models = await c.listModels();
    expect(models).toEqual(['llama3.2']);
  });

  it('listModels() falls back on non-200 response', async () => {
    const c = new OllamaConnector({
      model:   'llama3.2',
      fetcher: mockJsonFetch(503, {}),
    });
    const models = await c.listModels();
    expect(models).toEqual(['llama3.2']);
  });
});

// ─── Streaming ────────────────────────────────────────────────────────────────

describe('OllamaConnector — streaming', () => {
  it('yields chunks from NDJSON stream', async () => {
    const body = makeStream([
      ollamaStreamChunk('Hello'),
      ollamaStreamChunk(' world', true),
    ]);
    const c      = new OllamaConnector({ model: 'llama3.2', fetcher: mockStreamFetch(200, body) });
    const chunks = await collectStream(c.stream(makeRequest()));
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.every(isValidStreamChunk)).toBe(true);
  });

  it('last chunk has done = true', async () => {
    const body = makeStream([ollamaStreamChunk('Hi', true)]);
    const c    = new OllamaConnector({ model: 'llama3.2', fetcher: mockStreamFetch(200, body) });
    const chunks = await collectStream(c.stream(makeRequest()));
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('sends stream: true in request body', async () => {
    let capturedBody: unknown;
    const fetcher = async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      const body = makeStream([ollamaStreamChunk('hi', true)]);
      return new Response(body, { status: 200 });
    };
    const c = new OllamaConnector({ model: 'llama3.2', fetcher });
    await collectStream(c.stream(makeRequest()));
    expect((capturedBody as Record<string, unknown>)['stream']).toBe(true);
  });
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe('OllamaConnector — health', () => {
  it('returns connected when /api/tags responds 200', async () => {
    const c = makeConnector(mockJsonFetch(200, { models: [] }));
    const h = await c.health();
    expect(h.status).toBe('connected');
  });

  it('returns error when server is down', async () => {
    const c = new OllamaConnector({ model: 'llama3.2', fetcher: mockNetworkErrorFetch() });
    const h = await c.health();
    expect(h.status).toBe('error');
    expect(h.message).toBeTruthy();
  });

  it('includes latency in health report', async () => {
    const c = makeConnector(mockJsonFetch(200, {}));
    const h = await c.health();
    expect(typeof h.latencyMs).toBe('number');
  });
});

// ─── Capabilities ─────────────────────────────────────────────────────────────

describe('OllamaConnector — capabilities', () => {
  it('supports streaming and JSON', () => {
    const caps = makeConnector().capabilities();
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.supportsJSON).toBe(true);
  });

  it('type is local_model', () => {
    expect(makeConnector().type).toBe('local_model');
  });

  it('connector id encodes the model name', () => {
    const c = new OllamaConnector({ model: 'mistral:7b', fetcher: mockJsonFetch(200, ollamaSuccessResponse('ok')) });
    expect(c.id).toContain('ollama');
  });
});
