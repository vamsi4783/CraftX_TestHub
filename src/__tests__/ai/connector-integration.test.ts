/**
 * Phase 5.5 M5 — Connector Integration Tests (Phase B + E)
 *
 * Covers edge cases and security properties not in the per-connector unit tests:
 *   Phase B: malformed / minimal response parsing
 *   Phase E: security invariants (stub detection, key isolation)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { GeminiFlashConnector }          from '../../ai/providers/GeminiFlashConnector';
import { OllamaConnector }               from '../../ai/providers/OllamaConnector';
import { OpenAICompatibleConnector }     from '../../ai/providers/OpenAICompatibleConnector';
import { ClaudeAdapter }                 from '../../ai/providers/ClaudeAdapter';
import { SecureString }                  from '../../ai/security/SecureString';
import { AIConnectorFactory }            from '../../ai/factory/AIConnectorFactory';
import { AIConnectorError }              from '../../ai/types/AITypes';

afterEach(() => {
  AIConnectorFactory._testFetcher = undefined;
});
import {
  makeRequest,
  makeStream,
  mockJsonFetch,
  mockStreamFetch,
  geminiSuccessResponse,
  ollamaSuccessResponse,
  oaiSuccessResponse,
  ollamaStreamChunk,
  collectStream,
} from './helpers/testHelpers';

// ─── Phase B: Gemini edge cases ───────────────────────────────────────────────

describe('GeminiFlashConnector — malformed / minimal responses', () => {
  function gem(body: unknown) {
    return new GeminiFlashConnector({
      apiKey:  SecureString.from('test-key'),
      fetcher: mockJsonFetch(200, body),
    });
  }

  it('empty candidates array → text is empty string', async () => {
    const r = await gem({ candidates: [] }).execute(makeRequest());
    expect(r.text).toBe('');
  });

  it('candidates with empty parts array → text is empty string', async () => {
    const r = await gem({
      candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'STOP' }],
    }).execute(makeRequest());
    expect(r.text).toBe('');
  });

  it('multiple parts are joined', async () => {
    const r = await gem({
      candidates: [{
        content: { parts: [{ text: 'foo' }, { text: 'bar' }], role: 'model' },
        finishReason: 'STOP',
      }],
    }).execute(makeRequest());
    expect(r.text).toBe('foobar');
  });

  it('missing usageMetadata → usage is undefined', async () => {
    const r = await gem({
      candidates: [{ content: { parts: [{ text: 'hi' }], role: 'model' }, finishReason: 'STOP' }],
    }).execute(makeRequest());
    expect(r.usage).toBeUndefined();
  });

  it('null candidates property → text is empty string', async () => {
    const r = await gem({ candidates: null }).execute(makeRequest());
    expect(r.text).toBe('');
  });
});

// ─── Phase B: Gemini streaming edge cases ────────────────────────────────────

describe('GeminiFlashConnector — streaming edge cases', () => {
  it('chunk with empty parts yields empty delta', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(enc.encode('data: ' + JSON.stringify({
          candidates: [{ content: { parts: [], role: 'model' }, finishReason: '' }],
        }) + '\n'));
        ctrl.enqueue(enc.encode('data: ' + JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'hi' }], role: 'model' }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }) + '\n'));
        ctrl.close();
      },
    });
    const c = new GeminiFlashConnector({
      apiKey:  SecureString.from('test-key'),
      fetcher: mockStreamFetch(200, body),
    });
    const chunks = await collectStream(c.stream(makeRequest()));
    expect(chunks[0].delta).toBe('');
    expect(chunks[1].delta).toBe('hi');
    expect(chunks[1].done).toBe(true);
  });
});

// ─── Phase B: OllamaConnector edge cases ────────────────────────────────────

describe('OllamaConnector — malformed / minimal responses', () => {
  function olla(body: unknown) {
    return new OllamaConnector({
      model:   'llama3.2',
      fetcher: mockJsonFetch(200, body),
    });
  }

  it('missing eval_count → usage is undefined', async () => {
    const r = await olla({
      model:   'llama3.2',
      message: { role: 'assistant', content: 'hello' },
      done:    true,
    }).execute(makeRequest());
    expect(r.usage).toBeUndefined();
    expect(r.text).toBe('hello');
  });

  it('malformed NDJSON lines are silently skipped (parseNDJSON is tolerant)', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(enc.encode('NOT_VALID_JSON\n'));
        ctrl.close();
      },
    });
    const c = new OllamaConnector({
      model:   'llama3.2',
      fetcher: mockStreamFetch(200, body),
    });
    // parseNDJSON skips parse errors — no crash, just no chunks
    const chunks = await collectStream(c.stream(makeRequest()));
    expect(chunks).toHaveLength(0);
  });

  it('stream with done:true emits final chunk and stops', async () => {
    const body = makeStream([
      ollamaStreamChunk('tok1', false),
      ollamaStreamChunk('tok2', true),
    ]);
    const c = new OllamaConnector({
      model:   'llama3.2',
      fetcher: mockStreamFetch(200, body),
    });
    const chunks = await collectStream(c.stream(makeRequest()));
    expect(chunks.length).toBe(2);
    expect(chunks[1].done).toBe(true);
    expect(chunks[1].usage?.outputTokens).toBe(20);
  });
});

// ─── Phase B: OpenAICompatibleConnector edge cases ───────────────────────────

describe('OpenAICompatibleConnector — malformed / minimal responses', () => {
  function oai(body: unknown) {
    return new OpenAICompatibleConnector({
      id:      'test_oai',
      name:    'Test OAI',
      baseUrl: 'http://localhost:1234/v1',
      model:   'phi-3',
      fetcher: mockJsonFetch(200, body),
    });
  }

  it('empty choices array → text is empty string', async () => {
    const r = await oai({ choices: [], usage: null }).execute(makeRequest());
    expect(r.text).toBe('');
  });

  it('choice with null content → text is empty string', async () => {
    const r = await oai({
      choices: [{ message: { role: 'assistant', content: null }, finish_reason: 'stop', index: 0 }],
      usage: null,
    }).execute(makeRequest());
    expect(r.text).toBe('');
  });

  it('missing usage → usage is undefined', async () => {
    const r = await oai({
      choices: [{ message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop', index: 0 }],
    }).execute(makeRequest());
    expect(r.usage).toBeUndefined();
  });
});

// ─── Phase B: Factory integration ─────────────────────────────────────────────

describe('AIConnectorFactory — integration: factory → connector → execute', () => {
  it('Gemini: factory-built connector executes correctly', async () => {
    AIConnectorFactory._testFetcher = mockJsonFetch(200, geminiSuccessResponse('factory test'));
    const connector = AIConnectorFactory.fromConfig({
      id:         'gemini',
      name:       'Gemini',
      type:       'api_provider',
      priority:   10,
      enabled:    true,
      authMode:   'api_key',
      userApiKey: 'AIza-test-key',
      metadata:   { model: 'gemini-2.0-flash' },
    });
    const r = await connector.execute(makeRequest());
    expect(r.text).toBe('factory test');
    expect(r.connector).toBe('gemini_flash');
  });

  it('Ollama: factory-built connector executes correctly', async () => {
    AIConnectorFactory._testFetcher = mockJsonFetch(200, ollamaSuccessResponse('ollama factory test'));
    const connector = AIConnectorFactory.fromConfig({
      id:            'ollama',
      name:          'Ollama',
      type:          'local_model',
      priority:      10,
      enabled:       true,
      authMode:      'none',
      localEndpoint: 'http://localhost:11434',
      metadata:      { model: 'llama3.2' },
    });
    const r = await connector.execute(makeRequest());
    expect(r.text).toBe('ollama factory test');
  });

  it('OAI-compat: factory-built connector executes correctly', async () => {
    AIConnectorFactory._testFetcher = mockJsonFetch(200, oaiSuccessResponse('oai factory test'));
    const connector = AIConnectorFactory.fromConfig({
      id:            'groq_test',
      name:          'Groq',
      type:          'api_provider',
      priority:      10,
      enabled:       true,
      authMode:      'api_key',
      userApiKey:    'gsk-test-key',
      localEndpoint: 'https://api.groq.com/openai/v1',
      metadata:      { model: 'llama3-70b' },
    });
    const r = await connector.execute(makeRequest());
    expect(r.text).toBe('oai factory test');
  });
});

// ─── Phase E: Security — key isolation ───────────────────────────────────────

describe('Security — API key isolation', () => {
  it('Gemini: API key appears in URL, not in request body', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    const fetcher = async (url: string | URL, init?: RequestInit) => {
      capturedUrl  = String(url);
      capturedBody = (init?.body as string) ?? '';
      return new Response(JSON.stringify(geminiSuccessResponse('ok')), { status: 200 });
    };
    const c = new GeminiFlashConnector({
      apiKey:  SecureString.from('AIza-super-secret'),
      fetcher,
    });
    await c.execute(makeRequest());
    expect(capturedUrl).toContain('?key=AIza-super-secret');
    expect(capturedBody).not.toContain('AIza-super-secret');
    expect(capturedBody).not.toContain('Authorization');
  });

  it('Ollama: no Authorization header sent', async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetcher = async (_url: string | URL, init?: RequestInit) => {
      const h = init?.headers;
      if (h && typeof (h as Headers).entries === 'function') {
        for (const [k, v] of (h as Headers).entries()) capturedHeaders[k.toLowerCase()] = v;
      } else if (h && typeof h === 'object') {
        capturedHeaders = Object.fromEntries(
          Object.entries(h as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])
        );
      }
      return new Response(JSON.stringify(ollamaSuccessResponse('ok')), { status: 200 });
    };
    const c = new OllamaConnector({ model: 'llama3.2', fetcher });
    await c.execute(makeRequest());
    expect(capturedHeaders['authorization']).toBeUndefined();
  });

  it('OAI-compat without key: no Authorization header', async () => {
    let authHeader: string | undefined;
    const fetcher = async (_url: string | URL, init?: RequestInit) => {
      const h = init?.headers;
      if (h && typeof h === 'object') {
        const headers = h instanceof Headers ? h : new Headers(h as HeadersInit);
        authHeader = headers.get('authorization') ?? undefined;
      }
      return new Response(JSON.stringify(oaiSuccessResponse('ok')), { status: 200 });
    };
    const c = new OpenAICompatibleConnector({
      id: 'local', name: 'Local', baseUrl: 'http://localhost:1234/v1', model: 'phi-3', fetcher,
    });
    await c.execute(makeRequest());
    expect(authHeader).toBeUndefined();
  });

  it('OAI-compat with key: Authorization header is Bearer <key>', async () => {
    let authHeader = '';
    const fetcher = async (_url: string | URL, init?: RequestInit) => {
      const h = init?.headers;
      if (h && typeof h === 'object') {
        const headers = h instanceof Headers ? h : new Headers(h as HeadersInit);
        authHeader = headers.get('authorization') ?? '';
      }
      return new Response(JSON.stringify(oaiSuccessResponse('ok')), { status: 200 });
    };
    const c = new OpenAICompatibleConnector({
      id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
      model: 'llama3', apiKey: SecureString.from('gsk-my-key'), fetcher,
    });
    await c.execute(makeRequest());
    expect(authHeader).toBe('Bearer gsk-my-key');
  });
});

// ─── Phase E: Security — ClaudeAdapter is a stub ─────────────────────────────

describe('ClaudeAdapter — stub status', () => {
  it('execute() throws NOT_IMPLEMENTED (not registered, not callable)', async () => {
    const adapter = new ClaudeAdapter();
    await expect(adapter.execute(makeRequest())).rejects.toThrow(AIConnectorError);
    await expect(adapter.execute(makeRequest())).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('capabilities() returns correct Claude feature set', () => {
    const adapter = new ClaudeAdapter();
    const caps = adapter.capabilities();
    expect(caps.supportsReasoning).toBe(true);
    expect(caps.supportsVision).toBe(true);
    expect(caps.maxContextTokens).toBe(200_000);
  });

  it('is NOT registered in AIConnectorFactory', () => {
    expect(() =>
      AIConnectorFactory.fromConfig({
        id:       'claude',
        name:     'Claude',
        type:     'api_provider',
        priority: 10,
        enabled:  true,
        authMode: 'api_key',
      })
    ).toThrow();
  });
});
