/**
 * aiOrchestrationService — unit tests
 *
 * Architecture under test:
 *   aiOrchestrationService.execute()
 *       ↓
 *   AIConnectorRegistry (real)  +  AIOrchestrator (real)
 *       ↓
 *   IAIConnector (mocked per test)
 *
 * External dependencies mocked:
 *   - aiConnectorStore  (localStorage)
 *   - secureCredentialStore  (sessionStorage / memory)
 *   - AIConnectorFactory.fromConfig  (returns mock IAIConnector)
 *
 * No real API calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIOrchestrationServiceImpl, parseJSONFromText } from '../../features/ai-connectors/aiOrchestrationService';
import type { AIRequest, AIResponse, ConnectorHealth, AIConnectorCapabilities } from '../../ai';
import { AIConnectorError } from '../../ai';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../features/ai-connectors/aiConnectorStore', () => ({
  aiConnectorStore: { list: vi.fn(() => []) },
}));

vi.mock('../../features/ai-connectors/secureCredentialStore', () => ({
  secureCredentialStore: {
    retrieve:  vi.fn(() => undefined),
    hasSecret: vi.fn(() => false),
  },
}));

vi.mock('../../ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai')>();
  return {
    ...actual,
    AIConnectorFactory: {
      fromConfig: vi.fn(),
    },
  };
});

import { aiConnectorStore }        from '../../features/ai-connectors/aiConnectorStore';
import { secureCredentialStore }   from '../../features/ai-connectors/secureCredentialStore';
import { AIConnectorFactory }      from '../../ai';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

function makePersistedConnector(id: string, kind: 'gemini' | 'ollama' | 'openai_compatible' | 'mcp' = 'gemini', overrides: object = {}) {
  return {
    id, kind,
    displayName: `${id} connector`,
    enabled:     true,
    priority:    10,
    model:       kind === 'gemini' ? 'gemini-2.0-flash' : 'llama3.2',
    endpoint:    kind === 'ollama' ? 'http://localhost:11434' : undefined,
    createdAt:   now,
    updatedAt:   now,
    ...overrides,
  };
}

const CAPS_JSON: AIConnectorCapabilities = {
  supportsVision:      false,
  supportsStreaming:   false,
  supportsJSON:        true,
  supportsTools:       false,
  supportsReasoning:   false,
  supportsLongContext: false,
  supportsImages:      false,
  supportsFiles:       false,
};

const CAPS_NO_JSON: AIConnectorCapabilities = { ...CAPS_JSON, supportsJSON: false };

function mockConnector(id: string, opts: {
  caps?: AIConnectorCapabilities;
  executeResult?: Partial<AIResponse> | 'throw';
  healthStatus?: ConnectorHealth['status'];
} = {}) {
  const caps   = opts.caps ?? CAPS_JSON;
  const health: ConnectorHealth = { status: opts.healthStatus ?? 'connected', checkedAt: now };

  return {
    id,
    name:    `${id} mock`,
    type:    'api_provider' as const,
    connect:             vi.fn().mockResolvedValue(undefined),
    disconnect:          vi.fn().mockResolvedValue(undefined),
    health:              vi.fn().mockResolvedValue(health),
    capabilities:        vi.fn().mockReturnValue(caps),
    execute:             opts.executeResult === 'throw'
      ? vi.fn().mockRejectedValue(new Error(`${id} execute failed`))
      : vi.fn().mockResolvedValue({
          requestId:        'req',
          text:             opts.executeResult?.text ?? '{"ok":true}',
          structuredOutput: undefined,
          reasoningAvailable: false,
          latency:          10,
          provider:         id,
          connector:        id,
          model:            'test-model',
          ...(opts.executeResult ?? {}),
        } as AIResponse),
    stream:              vi.fn(),
    cancel:              vi.fn().mockResolvedValue(undefined),
    configurationSchema: vi.fn().mockReturnValue({ fields: [] }),
  };
}

function makeSvc() {
  return new AIOrchestrationServiceImpl();
}

// ─── parseJSONFromText ────────────────────────────────────────────────────────

describe('parseJSONFromText', () => {
  it('parses plain JSON', () => {
    expect(parseJSONFromText('{"ok":true}')).toEqual({ ok: true });
  });

  it('strips ```json fences', () => {
    expect(parseJSONFromText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('strips bare ``` fences', () => {
    expect(parseJSONFromText('```\n{"b":2}\n```')).toEqual({ b: 2 });
  });

  it('throws on invalid JSON after stripping', () => {
    expect(() => parseJSONFromText('not json')).toThrow();
  });
});

// ─── hasUsableConnectors ─────────────────────────────────────────────────────

describe('hasUsableConnectors', () => {
  beforeEach(() => vi.mocked(aiConnectorStore.list).mockReturnValue([]));

  it('returns false when no connectors', () => {
    expect(makeSvc().hasUsableConnectors()).toBe(false);
  });

  it('returns true with an enabled gemini connector', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('gemini')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(true);
    expect(makeSvc().hasUsableConnectors()).toBe(true);
  });

  it('returns true with an enabled ollama connector', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('ollama', 'ollama')] as never);
    expect(makeSvc().hasUsableConnectors()).toBe(true);
  });

  it('returns false when the only connector is disabled', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('gemini', 'gemini', { enabled: false })] as never);
    expect(makeSvc().hasUsableConnectors()).toBe(false);
  });

  it('returns false when the only connector is MCP', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('mcp_1', 'mcp')] as never);
    expect(makeSvc().hasUsableConnectors()).toBe(false);
  });
});

// ─── execute — connector selection ────────────────────────────────────────────

describe('execute — connector selection', () => {
  const REQ: AIRequest = {
    requestId: 'r1', task: 'generic',
    userPrompt: 'test prompt',
  };

  beforeEach(() => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    vi.mocked(AIConnectorFactory.fromConfig).mockReset();
    // Gemini connectors require a session key — default true so Gemini tests work;
    // tests that verify Ollama-only paths are unaffected by this setting.
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(true);
  });

  it('throws NO_CONNECTORS when no usable connectors exist', async () => {
    const svc = makeSvc();
    await expect(svc.execute(REQ)).rejects.toMatchObject({ code: 'NO_CONNECTORS' });
  });

  it('user configures Gemini → orchestrator selects Gemini', async () => {
    const connector = mockConnector('gemini');
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(connector as never);

    const svc  = makeSvc();
    const resp = await svc.execute(REQ);
    expect(resp.connector).toBe('gemini');
    expect(connector.execute).toHaveBeenCalledOnce();
  });

  it('user configures Ollama → orchestrator selects Ollama', async () => {
    const connector = mockConnector('ollama');
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('ollama', 'ollama')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(connector as never);

    const resp = await makeSvc().execute(REQ);
    expect(resp.connector).toBe('ollama');
  });

  it('disabled connector is never selected', async () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makePersistedConnector('gemini', 'gemini', { enabled: false }),
    ] as never);
    const svc = makeSvc();
    await expect(svc.execute(REQ)).rejects.toMatchObject({ code: 'NO_CONNECTORS' });
    expect(AIConnectorFactory.fromConfig).not.toHaveBeenCalled();
  });

  it('higher-priority connector wins (lower number = higher priority)', async () => {
    const c1 = mockConnector('ollama');
    const c2 = mockConnector('gemini');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makePersistedConnector('gemini', 'gemini', { priority: 20 }),
      makePersistedConnector('ollama', 'ollama', { priority: 5 }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation((cfg) =>
      cfg.id === 'ollama' ? (c1 as never) : (c2 as never),
    );

    const resp = await makeSvc().execute(REQ);
    expect(resp.connector).toBe('ollama');
    expect(c1.execute).toHaveBeenCalledOnce();
    expect(c2.execute).not.toHaveBeenCalled();
  });

  it('failed connector falls back to next enabled connector', async () => {
    const bad  = mockConnector('gemini',  { executeResult: 'throw' });
    const good = mockConnector('ollama');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makePersistedConnector('gemini', 'gemini', { priority: 1 }),
      makePersistedConnector('ollama', 'ollama', { priority: 2 }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation((cfg) =>
      cfg.id === 'gemini' ? (bad as never) : (good as never),
    );

    const resp = await makeSvc().execute(REQ);
    expect(resp.connector).toBe('ollama');
    expect(bad.execute).toHaveBeenCalled();
    expect(good.execute).toHaveBeenCalledOnce();
  });

  it('all connectors failing throws ALL_FAILED', async () => {
    const bad1 = mockConnector('gemini', { executeResult: 'throw' });
    const bad2 = mockConnector('ollama', { executeResult: 'throw' });
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makePersistedConnector('gemini', 'gemini', { priority: 1 }),
      makePersistedConnector('ollama', 'ollama', { priority: 2 }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation((cfg) =>
      cfg.id === 'gemini' ? (bad1 as never) : (bad2 as never),
    );
    await expect(makeSvc().execute(REQ)).rejects.toThrow();
  });

  it('capability mismatch (supportsJSON=false) skips connector', async () => {
    const noJson = mockConnector('gemini', { caps: CAPS_NO_JSON });
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(noJson as never);

    await expect(makeSvc().execute(REQ)).rejects.toMatchObject({ code: 'NO_CONNECTORS' });
    expect(noJson.execute).not.toHaveBeenCalled();
  });

  it("user's configured model is passed to the connector via factory config", async () => {
    const connector = mockConnector('gemini');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makePersistedConnector('gemini', 'gemini', { model: 'gemini-1.5-pro' }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(connector as never);
    await makeSvc().execute(REQ);
    const cfg = vi.mocked(AIConnectorFactory.fromConfig).mock.calls[0][0];
    expect((cfg.metadata as { model: string }).model).toBe('gemini-1.5-pro');
  });
});

// ─── API key security ────────────────────────────────────────────────────────

describe('API key security', () => {
  const REQ: AIRequest = { requestId: 'sec1', task: 'generic', userPrompt: 'hi' };

  beforeEach(() => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mockConnector('gemini') as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(true);
  });

  it('SecureCredentialStore.retrieve is called to get the API key', async () => {
    vi.mocked(secureCredentialStore.retrieve).mockReturnValue({
      reveal: () => 'AIza-test-key',
      toString: () => '[REDACTED]',
      toJSON:   () => '[REDACTED]',
    } as never);
    await makeSvc().execute(REQ);
    expect(secureCredentialStore.retrieve).toHaveBeenCalledWith('gemini');
  });

  it('API key is NOT passed as a plain string into execute() — it goes through factory only', async () => {
    vi.mocked(secureCredentialStore.retrieve).mockReturnValue({
      reveal: () => 'AIza-super-secret',
      toString: () => '[REDACTED]',
      toJSON:   () => '[REDACTED]',
    } as never);
    await makeSvc().execute(REQ);
    // The request passed to connector.execute should not contain the raw key
    const connector = vi.mocked(AIConnectorFactory.fromConfig).mock.results[0].value as ReturnType<typeof mockConnector>;
    const callArg   = (connector.execute as ReturnType<typeof vi.fn>).mock.calls[0][0] as AIRequest;
    expect(JSON.stringify(callArg)).not.toContain('AIza-super-secret');
  });

  it('API key never appears in test-result error message', async () => {
    const bad = mockConnector('gemini');
    vi.mocked(bad.execute).mockRejectedValue(new Error('Auth failed: Bearer AIza-leaked-key'));
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(bad as never);
    const result = await makeSvc().executeTestPrompt();
    expect(result.success).toBe(false);
    expect(result.error).not.toContain('AIza-leaked-key');
    expect(result.error).toContain('[REDACTED]');
  });
});

// ─── No TestHub API key required ─────────────────────────────────────────────

describe('no TestHub API key required', () => {
  it('getStatus() always reports requiresTestHubApiKey: false', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    const status = makeSvc().getStatus();
    expect(status.requiresTestHubApiKey).toBe(false);
  });

  it('Ollama/local flow works with no API key configured', async () => {
    const connector = mockConnector('ollama');
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('ollama', 'ollama')] as never);
    vi.mocked(secureCredentialStore.retrieve).mockReturnValue(undefined);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(connector as never);

    const resp = await makeSvc().execute({ requestId: 'r', task: 'generic', userPrompt: 'hi' });
    expect(resp.connector).toBe('ollama');
    // Config passed to factory should have no userApiKey
    const cfg = vi.mocked(AIConnectorFactory.fromConfig).mock.calls[0][0];
    expect(cfg.userApiKey).toBeUndefined();
  });
});

// ─── MCP graceful handling ────────────────────────────────────────────────────

describe('MCP graceful handling', () => {
  it('MCP connector is excluded from usable set (no text gen without transport)', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('mcp_1', 'mcp')] as never);
    const svc = makeSvc();
    expect(svc.hasUsableConnectors()).toBe(false);
  });

  it('MCP connector appears in status fallback chain for display', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('mcp_1', 'mcp')] as never);
    const status = makeSvc().getStatus();
    expect(status.fallbackChain).toHaveLength(1);
    expect(status.fallbackChain[0].kind).toBe('mcp');
    expect(status.hasUsableConnectors).toBe(false);
  });
});

// ─── getStatus ────────────────────────────────────────────────────────────────

describe('getStatus', () => {
  it('shows no active connector when empty', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    const s = makeSvc().getStatus();
    expect(s.hasConnectors).toBe(false);
    expect(s.activeConnectorId).toBeUndefined();
    expect(s.fallbackChain).toHaveLength(0);
  });

  it('shows local model available when ollama configured', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('ollama', 'ollama')] as never);
    expect(makeSvc().getStatus().localModelAvailable).toBe(true);
  });

  it('shows user API key configured when secret exists', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('gemini')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(true);
    expect(makeSvc().getStatus().userApiKeyConfigured).toBe(true);
  });

  it('cost category for ollama is local', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('ollama', 'ollama')] as never);
    expect(makeSvc().getStatus().fallbackChain[0].costCategory).toBe('local');
  });

  it('cost category for gemini without key is free_tier', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('gemini')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(false);
    expect(makeSvc().getStatus().fallbackChain[0].costCategory).toBe('free_tier');
  });

  it('cost category for gemini with key is user_api', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('gemini')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(true);
    expect(makeSvc().getStatus().fallbackChain[0].costCategory).toBe('user_api');
  });
});

// ─── invalidate ──────────────────────────────────────────────────────────────

describe('invalidate', () => {
  it('rebuilds orchestrator after invalidate()', async () => {
    const REQ: AIRequest = { requestId: 'inv', task: 'generic', userPrompt: 'hi' };

    // First: gemini connector
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mockConnector('gemini') as never);
    const svc = makeSvc();
    await svc.execute(REQ);

    // Invalidate, then reconfigure with ollama
    svc.invalidate();
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('ollama', 'ollama')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mockConnector('ollama') as never);
    const resp = await svc.execute(REQ);
    expect(resp.connector).toBe('ollama');
  });
});

// ─── executeTestPrompt ────────────────────────────────────────────────────────

describe('executeTestPrompt', () => {
  it('returns success with connector/model on happy path', async () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(
      mockConnector('gemini', { executeResult: { text: '{"ok":true}', connector: 'gemini', model: 'gemini-2.0-flash' } }) as never,
    );
    const result = await makeSvc().executeTestPrompt();
    expect(result.success).toBe(true);
    expect(result.connectorUsed).toBe('gemini');
    expect(result.modelUsed).toBe('gemini-2.0-flash');
    expect(typeof result.latencyMs).toBe('number');
  });

  it('returns failure with sanitized error when connector throws', async () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makePersistedConnector('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(
      mockConnector('gemini', { executeResult: 'throw' }) as never,
    );
    const result = await makeSvc().executeTestPrompt();
    expect(result.success).toBe(false);
    expect(result.error).toContain('execute failed');
  });

  it('returns failure when no connectors configured', async () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    const result = await makeSvc().executeTestPrompt();
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
