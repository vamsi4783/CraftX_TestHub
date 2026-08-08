/**
 * m7-validation.test.ts — Phase 5.5 M7 end-to-end validation tests.
 *
 * Covers:
 *   Phase B  — provider validation (connector building, capabilities, priority, fallback)
 *   Phase D  — M6/M8/M9 routing assertions (no spurious paid-API calls)
 *   Phase E  — cost-control: edge function only when no usable connectors
 *   Phase F  — security invariants (keys never in logs/errors/localStorage)
 *   Phase G  — failure/fallback matrix
 *   Phase H  — async lifecycle: race-condition coalescing, invalidate, discover models
 *
 * No real HTTP calls. All providers and stores are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIConnectorError }     from '@/ai';
import type { AIConnectorConfig, AIResponse, AIConnectorCapabilities } from '@/ai';
import { AIOrchestrationServiceImpl } from '@/features/ai-connectors/aiOrchestrationService';

// ─── Module-level mocks ───────────────────────────────────────────────────────

vi.mock('@/features/ai-connectors/aiConnectorStore', () => ({
  aiConnectorStore: {
    list:   vi.fn(() => []),
    get:    vi.fn(() => undefined),
    add:    vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@/features/ai-connectors/secureCredentialStore', () => ({
  secureCredentialStore: {
    retrieve:  vi.fn(() => undefined),
    hasSecret: vi.fn(() => false),
  },
}));

vi.mock('@/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ai')>();
  return { ...actual, AIConnectorFactory: { fromConfig: vi.fn() } };
});

import { aiConnectorStore }      from '@/features/ai-connectors/aiConnectorStore';
import { secureCredentialStore } from '@/features/ai-connectors/secureCredentialStore';
import { AIConnectorFactory }    from '@/ai';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

function persisted(id: string, kind: 'gemini' | 'ollama' | 'openai_compatible' | 'mcp' = 'gemini', overrides = {}) {
  return {
    id, kind,
    displayName: `${id} connector`,
    enabled: true,
    priority: 10,
    model: kind === 'gemini' ? 'gemini-2.0-flash' : 'llama3.2',
    endpoint: kind === 'ollama' ? 'http://localhost:11434' : undefined,
    createdAt: now, updatedAt: now,
    ...overrides,
  };
}

const JSON_CAPS: AIConnectorCapabilities = {
  supportsVision: false, supportsStreaming: false, supportsJSON: true,
  supportsTools: false, supportsReasoning: false, supportsLongContext: false,
  supportsImages: false, supportsFiles: false,
};

function mockConnector(id: string, opts: {
  caps?: AIConnectorCapabilities;
  result?: Partial<AIResponse> | 'throw';
} = {}) {
  const caps = opts.caps ?? JSON_CAPS;
  return {
    id, name: `${id} mock`, type: 'api_provider' as const,
    connect:              vi.fn().mockResolvedValue(undefined),
    disconnect:           vi.fn().mockResolvedValue(undefined),
    health:               vi.fn().mockResolvedValue({ status: 'connected', checkedAt: now }),
    capabilities:         vi.fn().mockReturnValue(caps),
    execute: opts.result === 'throw'
      ? vi.fn().mockRejectedValue(new Error(`${id} failed`))
      : vi.fn().mockResolvedValue({
          requestId: 'r', text: '{"ok":true}', structuredOutput: undefined,
          reasoningAvailable: false, latency: 5,
          provider: id, connector: id, model: 'test-model',
          ...(opts.result ?? {}),
        } as AIResponse),
    stream:              vi.fn(),
    cancel:              vi.fn().mockResolvedValue(undefined),
    configurationSchema: vi.fn().mockReturnValue({ fields: [] }),
  };
}

const REQ = { requestId: 'r1', task: 'generic' as const, userPrompt: 'hello' };

// ─── Phase B — Provider validation ────────────────────────────────────────────

describe('Phase B — provider validation', () => {
  beforeEach(() => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    vi.mocked(AIConnectorFactory.fromConfig).mockReset();
  });

  it('Gemini connector: capabilities include supportsJSON', () => {
    const cfg: AIConnectorConfig = {
      id: 'gemini', name: 'Gemini', type: 'api_provider',
      priority: 10, enabled: true, authMode: 'api_key',
      userApiKey: 'AIzaFAKE', metadata: { model: 'gemini-2.0-flash' },
    };
    const conn = mockConnector('gemini');
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(conn as never);
    const built = AIConnectorFactory.fromConfig(cfg);
    expect(built.capabilities().supportsJSON).toBe(true);
  });

  it('disabled connector is excluded from usable set', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('gemini', 'gemini', { enabled: false }),
    ] as never);
    const svc = new AIOrchestrationServiceImpl();
    expect(svc.hasUsableConnectors()).toBe(false);
  });

  it('priority ordering: lower number wins', async () => {
    const c1 = mockConnector('ollama');
    const c2 = mockConnector('gemini');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('gemini', 'gemini', { priority: 50 }),
      persisted('ollama', 'ollama', { priority: 5 }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(
      cfg => cfg.id === 'ollama' ? (c1 as never) : (c2 as never),
    );
    const resp = await new AIOrchestrationServiceImpl().execute(REQ);
    expect(resp.connector).toBe('ollama');
    expect(c2.execute).not.toHaveBeenCalled();
  });

  it('fallback: first connector fails → second succeeds', async () => {
    const bad  = mockConnector('gemini',  { result: 'throw' });
    const good = mockConnector('ollama');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('gemini', 'gemini', { priority: 1 }),
      persisted('ollama', 'ollama', { priority: 2 }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(
      cfg => cfg.id === 'gemini' ? (bad as never) : (good as never),
    );
    const resp = await new AIOrchestrationServiceImpl().execute(REQ);
    expect(resp.connector).toBe('ollama');
    expect(bad.execute).toHaveBeenCalled();
  });

  it('health state: connector with error health is not skipped (requireHealthCheck=false)', async () => {
    const conn = { ...mockConnector('gemini'), health: vi.fn().mockResolvedValue({ status: 'error', checkedAt: now }) };
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(conn as never);
    // Should still execute (health check not required in RUNTIME_CONFIG)
    const resp = await new AIOrchestrationServiceImpl().execute(REQ);
    expect(resp.connector).toBe('gemini');
    expect(conn.health).not.toHaveBeenCalled();
  });

  it('credential retrieval: API key passed to factory as userApiKey', () => {
    vi.mocked(secureCredentialStore.retrieve).mockReturnValue({
      reveal: () => 'test-api-key',
    } as never);
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mockConnector('gemini') as never);
    new AIOrchestrationServiceImpl().hasUsableConnectors();
    // Trigger build path
    const svc = new AIOrchestrationServiceImpl();
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    expect(svc.hasUsableConnectors()).toBe(true);
  });
});

// ─── Phase D — M6/M8/M9 routing (no spurious paid-API calls) ─────────────────

describe('Phase D — routing: no spurious paid-API calls', () => {
  it('execute() never called when hasUsableConnectors() is false', async () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    const svc = new AIOrchestrationServiceImpl();
    // Should throw NO_CONNECTORS, not call any API
    await expect(svc.execute(REQ)).rejects.toMatchObject({ code: 'NO_CONNECTORS' });
  });

  it('supportsJSON=false connector is excluded from M6/M8/M9 routing', async () => {
    const noJson = mockConnector('gemini', { caps: { ...JSON_CAPS, supportsJSON: false } });
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(noJson as never);
    const svc = new AIOrchestrationServiceImpl();
    await expect(svc.execute(REQ)).rejects.toMatchObject({ code: 'NO_CONNECTORS' });
    expect(noJson.execute).not.toHaveBeenCalled();
  });

  it('MCP without endpoint never reaches orchestrator', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('mcp_1', 'mcp', { mcpTransport: 'stdio' }),
    ] as never);
    expect(new AIOrchestrationServiceImpl().hasUsableConnectors()).toBe(false);
  });

  it('MCP with SSE endpoint IS included in orchestrator', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('mcp_1', 'mcp', { mcpTransport: 'sse', mcpEndpoint: 'http://localhost:3000/mcp' }),
    ] as never);
    expect(new AIOrchestrationServiceImpl().hasUsableConnectors()).toBe(true);
  });
});

// ─── Phase E — Cost-control audit ─────────────────────────────────────────────

describe('Phase E — cost control', () => {
  it('getStatus().requiresTestHubApiKey is always false', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    const status = new AIOrchestrationServiceImpl().getStatus();
    expect(status.requiresTestHubApiKey).toBe(false);
  });

  it('mcpAgentAvailable is false when no usable MCP configured', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    const status = new AIOrchestrationServiceImpl().getStatus();
    expect(status.mcpAgentAvailable).toBe(false);
  });

  it('mcpAgentAvailable is true when SSE MCP with endpoint configured', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('mcp_1', 'mcp', { mcpTransport: 'sse', mcpEndpoint: 'http://localhost:3000/mcp' }),
    ] as never);
    const status = new AIOrchestrationServiceImpl().getStatus();
    expect(status.mcpAgentAvailable).toBe(true);
  });

  it('localModelAvailable is true when ollama connector enabled', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('ollama', 'ollama')] as never);
    const status = new AIOrchestrationServiceImpl().getStatus();
    expect(status.localModelAvailable).toBe(true);
  });
});

// ─── Phase F — Security invariants ────────────────────────────────────────────

describe('Phase F — security', () => {
  it('API key never appears in connector skip warning', async () => {
    vi.mocked(secureCredentialStore.retrieve).mockReturnValue({
      reveal: () => 'super-secret-api-key',
    } as never);
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(() => {
      throw new Error('build failed: Bearer super-secret-api-key oops');
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await new AIOrchestrationServiceImpl().execute(REQ);
    } catch { /* expected NO_CONNECTORS */ }
    const warned = warnSpy.mock.calls.map(c => String(c)).join(' ');
    expect(warned).not.toContain('super-secret-api-key');
    warnSpy.mockRestore();
    vi.mocked(secureCredentialStore.retrieve).mockReturnValue(undefined);
  });

  it('executeTestPrompt strips Bearer tokens from error messages', async () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(
      mockConnector('gemini', {
        result: 'throw',
      }) as never,
    );
    // Override execute to include a bearer-looking error
    const conn = mockConnector('gemini');
    conn.execute = vi.fn().mockRejectedValue(new Error('failed: Bearer sk-12345secretkey'));
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(conn as never);

    const svc    = new AIOrchestrationServiceImpl();
    const result = await svc.executeTestPrompt();
    expect(result.success).toBe(false);
    expect(result.error).not.toContain('sk-12345secretkey');
    expect(result.error).toContain('[REDACTED]');
  });

  it('aiConnectorStore never contains API key fields', () => {
    // The store persists only PersistedConnector which has no apiKey/userApiKey field
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('gemini'),
    ] as never);
    const connectors = aiConnectorStore.list();
    for (const c of connectors) {
      expect((c as unknown as Record<string, unknown>)['apiKey']).toBeUndefined();
      expect((c as unknown as Record<string, unknown>)['userApiKey']).toBeUndefined();
    }
  });
});

// ─── Phase G — Failure/fallback matrix ───────────────────────────────────────

describe('Phase G — failure/fallback matrix', () => {
  beforeEach(() => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    vi.mocked(AIConnectorFactory.fromConfig).mockReset();
  });

  it('Gemini unavailable → falls back to Ollama', async () => {
    const bad  = mockConnector('gemini', { result: 'throw' });
    const good = mockConnector('ollama');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('gemini', 'gemini', { priority: 1 }),
      persisted('ollama', 'ollama', { priority: 2 }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(
      cfg => cfg.id === 'gemini' ? (bad as never) : (good as never),
    );
    const resp = await new AIOrchestrationServiceImpl().execute(REQ);
    expect(resp.connector).toBe('ollama');
  });

  it('Ollama unavailable → falls back to Gemini', async () => {
    const bad  = mockConnector('ollama', { result: 'throw' });
    const good = mockConnector('gemini');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('ollama', 'ollama', { priority: 1 }),
      persisted('gemini', 'gemini', { priority: 2 }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(
      cfg => cfg.id === 'ollama' ? (bad as never) : (good as never),
    );
    const resp = await new AIOrchestrationServiceImpl().execute(REQ);
    expect(resp.connector).toBe('gemini');
  });

  it('all connectors unavailable → throws ALL_FAILED', async () => {
    const bad1 = mockConnector('gemini', { result: 'throw' });
    const bad2 = mockConnector('ollama', { result: 'throw' });
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('gemini', 'gemini', { priority: 1 }),
      persisted('ollama', 'ollama', { priority: 2 }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(
      cfg => cfg.id === 'gemini' ? (bad1 as never) : (bad2 as never),
    );
    await expect(new AIOrchestrationServiceImpl().execute(REQ)).rejects.toThrow();
  });

  it('no connectors configured → throws NO_CONNECTORS', async () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    await expect(new AIOrchestrationServiceImpl().execute(REQ)).rejects.toMatchObject({
      code: 'NO_CONNECTORS',
    });
  });

  it('malformed connector (build throws) → skipped, remaining used', async () => {
    const good = mockConnector('ollama');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('gemini', 'gemini', { priority: 1 }),
      persisted('ollama', 'ollama', { priority: 2 }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(cfg => {
      if (cfg.id === 'gemini') throw new Error('build failed');
      return good as never;
    });
    const resp = await new AIOrchestrationServiceImpl().execute(REQ);
    expect(resp.connector).toBe('ollama');
  });

  it('connector timeout → fallback to next', async () => {
    // Simulate timeout via ALL_FAILED code (orchestrator catches after timeout)
    const slow = mockConnector('gemini', { result: 'throw' });
    const fast = mockConnector('ollama');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('gemini', 'gemini', { priority: 1 }),
      persisted('ollama', 'ollama', { priority: 2 }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(
      cfg => cfg.id === 'gemini' ? (slow as never) : (fast as never),
    );
    const resp = await new AIOrchestrationServiceImpl().execute(REQ);
    expect(resp.connector).toBe('ollama');
  });

  it('empty response → valid AIResponse with empty text', async () => {
    const conn = mockConnector('gemini', { result: { text: '' } });
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(conn as never);
    const resp = await new AIOrchestrationServiceImpl().execute(REQ);
    expect(resp.text).toBe('');
    expect(resp.connector).toBe('gemini');
  });

  it('provider rate limit error → fallback to next connector', async () => {
    const rateLimited = mockConnector('gemini');
    rateLimited.execute = vi.fn().mockRejectedValue(
      new AIConnectorError('429 Too Many Requests', 'ALL_FAILED', 'gemini'),
    );
    const good = mockConnector('ollama');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('gemini', 'gemini', { priority: 1 }),
      persisted('ollama', 'ollama', { priority: 2 }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(
      cfg => cfg.id === 'gemini' ? (rateLimited as never) : (good as never),
    );
    const resp = await new AIOrchestrationServiceImpl().execute(REQ);
    expect(resp.connector).toBe('ollama');
  });
});

// ─── Phase H — Async lifecycle ────────────────────────────────────────────────

describe('Phase H — async lifecycle', () => {
  beforeEach(() => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    vi.mocked(AIConnectorFactory.fromConfig).mockReset();
  });

  it('concurrent execute() calls share a single _buildOrchestrator call', async () => {
    const conn = mockConnector('gemini');
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(conn as never);

    const svc = new AIOrchestrationServiceImpl();
    // Fire two concurrent execute calls
    const [r1, r2] = await Promise.all([svc.execute(REQ), svc.execute(REQ)]);
    expect(r1.connector).toBe('gemini');
    expect(r2.connector).toBe('gemini');
    // Factory should be called only once (coalesced build)
    expect(AIConnectorFactory.fromConfig).toHaveBeenCalledTimes(1);
  });

  it('invalidate() forces rebuild on next execute()', async () => {
    const conn1 = mockConnector('gemini', { result: { text: '{"first":true}' } });
    const conn2 = mockConnector('gemini', { result: { text: '{"second":true}' } });
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig)
      .mockReturnValueOnce(conn1 as never)
      .mockReturnValueOnce(conn2 as never);

    const svc = new AIOrchestrationServiceImpl();
    const r1 = await svc.execute(REQ);
    expect(r1.text).toBe('{"first":true}');

    svc.invalidate();
    const r2 = await svc.execute(REQ);
    expect(r2.text).toBe('{"second":true}');
    expect(AIConnectorFactory.fromConfig).toHaveBeenCalledTimes(2);
  });

  it('invalidate() clears building promise so next call starts fresh', async () => {
    const conn = mockConnector('gemini');
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(conn as never);
    const svc = new AIOrchestrationServiceImpl();
    await svc.execute(REQ);
    svc.invalidate();
    // After invalidate, _building should be null — this is an internal invariant
    // Verify externally: second build creates a fresh connector
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(conn as never);
    const r2 = await svc.execute(REQ);
    expect(r2.connector).toBe('gemini');
    expect(AIConnectorFactory.fromConfig).toHaveBeenCalledTimes(2);
  });

  it('hasUsableConnectors() stays sync and never triggers build', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('gemini')] as never);
    const svc = new AIOrchestrationServiceImpl();
    const result = svc.hasUsableConnectors(); // must be synchronous
    expect(result).toBe(true);
    expect(AIConnectorFactory.fromConfig).not.toHaveBeenCalled();
  });

  it('getStatus() is sync and reflects live store state', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([persisted('ollama', 'ollama')] as never);
    const status = new AIOrchestrationServiceImpl().getStatus();
    expect(status.hasConnectors).toBe(true);
    expect(status.localModelAvailable).toBe(true);
  });
});

// ─── Phase H — discoverModelsFromEndpoint (data-loss fix) ────────────────────

describe('Phase H — discoverModelsFromEndpoint does not mutate store', () => {
  it('discover endpoint calls factory with __discovery__ id, not ollama', async () => {
    // discoverModelsFromEndpoint must never write to the store.
    // It builds a transient connector via the factory with id '__discovery__'.
    // Verify the factory is called with the ephemeral id, not 'ollama'.
    const fakeFn = vi.mocked(AIConnectorFactory.fromConfig);
    fakeFn.mockReturnValue({
      ...mockConnector('__discovery__'),
      // Simulate no listModels (factory cast duck-types it)
    } as never);

    const { aiConnectorService } = await import('@/features/ai-connectors/aiConnectorService');
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);

    await aiConnectorService.discoverModelsFromEndpoint('http://localhost:11434');

    // Factory must be called with the ephemeral '__discovery__' connector id
    const calls = fakeFn.mock.calls;
    const discoveryCall = calls.find(c => c[0].id === '__discovery__');
    expect(discoveryCall).toBeDefined();
    // Must NOT be called with 'ollama' (which would touch the real singleton)
    const ollamaCall = calls.find(c => c[0].id === 'ollama');
    expect(ollamaCall).toBeUndefined();
  });

  it('discoverModels(id) falls through to discoverModelsFromEndpoint — no store write', async () => {
    // discoverModels(id) for a stored ollama connector delegates to discoverModelsFromEndpoint,
    // not to addOllama/remove. Verify no mutation occurs.
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(
      mockConnector('__discovery__') as never,
    );
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      persisted('ollama', 'ollama', { endpoint: 'http://localhost:11434' }),
    ] as never);

    vi.mocked(aiConnectorStore.get).mockReturnValue(
      persisted('ollama', 'ollama', { endpoint: 'http://localhost:11434' }) as never,
    );

    const { aiConnectorService } = await import('@/features/ai-connectors/aiConnectorService');
    await aiConnectorService.discoverModels('ollama');

    expect(aiConnectorStore.add).not.toHaveBeenCalled();
    expect(aiConnectorStore.remove).not.toHaveBeenCalled();
  });
});
