/**
 * m9-hardening.test.ts — Phase 5.5 M9 Production Hardening Tests
 *
 * Phase E  — Connector failure matrix (14 deterministic scenarios)
 * Phase F  — MCP lifecycle: coalescing, stale-connection cleanup
 * Phase G  — Model discovery regression (no data-loss from the M7 fix)
 * Phase I  — API key audit: secrets never reach localStorage, logs, or request bodies
 *
 * All external I/O is mocked. No real API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks (must precede imports) ──────────────────────────────────────

vi.mock('@/features/ai-connectors/aiConnectorStore', () => ({
  aiConnectorStore: { list: vi.fn(() => []), get: vi.fn(), add: vi.fn(), remove: vi.fn(), update: vi.fn() },
}));

vi.mock('@/features/ai-connectors/secureCredentialStore', () => ({
  secureCredentialStore: {
    retrieve:  vi.fn(() => undefined),
    hasSecret: vi.fn(() => false),
    store:     vi.fn(),
    clear:     vi.fn(),
  },
}));

vi.mock('@/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ai')>();
  return { ...actual, AIConnectorFactory: { fromConfig: vi.fn() } };
});

vi.mock('@/features/ai-connectors/aiRuntimePolicy', () => ({
  aiRuntimePolicy: {
    isEdgeFunctionEnabled:  vi.fn(() => false),
    setEdgeFunctionEnabled: vi.fn(),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

vi.mock('@/services/failureAnalysis/ContextBuilder', () => ({
  ContextBuilder: class { buildPrompt() { return 'mocked-prompt'; } },
}));

// ─── Post-mock imports ────────────────────────────────────────────────────────

import { AIOrchestrationServiceImpl } from '@/features/ai-connectors/aiOrchestrationService';
import { aiConnectorStore }           from '@/features/ai-connectors/aiConnectorStore';
import { secureCredentialStore }      from '@/features/ai-connectors/secureCredentialStore';
import { AIConnectorFactory }         from '@/ai';
import { AIConnectorError }           from '@/ai';
import { aiRuntimePolicy }            from '@/features/ai-connectors/aiRuntimePolicy';
import { supabase }                   from '@/lib/supabase';
import type { AIResponse, AIConnectorCapabilities, ConnectorHealth } from '@/ai';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

function makeConnector(id: string, kind: 'gemini' | 'ollama' | 'openai_compatible' | 'mcp' = 'gemini', overrides: object = {}) {
  return {
    id, kind, displayName: `${id} connector`,
    enabled: true, priority: 10,
    model: kind === 'gemini' ? 'gemini-2.0-flash' : 'llama3.2',
    endpoint: kind === 'ollama' ? 'http://localhost:11434' : undefined,
    createdAt: now, updatedAt: now,
    ...overrides,
  };
}

const CAPS_JSON: AIConnectorCapabilities = {
  supportsVision: false, supportsStreaming: false, supportsJSON: true,
  supportsTools: false, supportsReasoning: false, supportsLongContext: false,
  supportsImages: false, supportsFiles: false,
};

function mockConnector(id: string, opts: {
  executeResult?: Partial<AIResponse> | 'throw' | 'timeout' | 'auth_fail' | 'rate_limit' | 'malformed';
  healthStatus?: ConnectorHealth['status'];
  caps?: AIConnectorCapabilities;
  connect?: 'ok' | 'throw';
  disconnect?: () => Promise<void>;
} = {}) {
  const health: ConnectorHealth = { status: opts.healthStatus ?? 'connected', checkedAt: now };
  let executeImpl: () => Promise<AIResponse>;

  switch (opts.executeResult) {
    case 'throw':
      executeImpl = () => Promise.reject(new Error(`${id} execute failed`));
      break;
    case 'timeout':
      executeImpl = () => Promise.reject(new AIConnectorError('Request timed out', 'TIMEOUT', id));
      break;
    case 'auth_fail':
      executeImpl = () => Promise.reject(new AIConnectorError('Authentication failed', 'AUTH_FAILED', id));
      break;
    case 'rate_limit':
      executeImpl = () => Promise.reject(new AIConnectorError('Rate limit exceeded', 'ALL_FAILED', id));
      break;
    case 'malformed':
      executeImpl = () => Promise.resolve({
        requestId: 'r', text: 'not valid json <<<', reasoningAvailable: false,
        latency: 5, provider: id, connector: id, model: 'm',
      } as AIResponse);
      break;
    default:
      executeImpl = () => Promise.resolve({
        requestId: 'r', text: JSON.stringify({ ok: true }),
        reasoningAvailable: false, latency: 5,
        provider: id, connector: id, model: 'test-model',
        ...(typeof opts.executeResult === 'object' ? opts.executeResult : {}),
      } as AIResponse);
  }

  const disconnectFn = opts.disconnect ?? vi.fn().mockResolvedValue(undefined);

  return {
    id, name: `${id} mock`,
    type: 'api_provider' as const,
    capabilities: vi.fn().mockReturnValue(opts.caps ?? CAPS_JSON),
    health:       vi.fn().mockResolvedValue(health),
    execute:      vi.fn().mockImplementation(executeImpl),
    stream:       vi.fn(),
    cancel:       vi.fn().mockResolvedValue(undefined),
    connect:      opts.connect === 'throw'
      ? vi.fn().mockRejectedValue(new Error(`${id} connect failed`))
      : vi.fn().mockResolvedValue(undefined),
    disconnect:   vi.fn().mockImplementation(disconnectFn),
    configurationSchema: vi.fn().mockReturnValue({ fields: [] }),
  };
}

function makeSvc() { return new AIOrchestrationServiceImpl(); }

const REQ = { requestId: 'r', task: 'generic' as const, userPrompt: 'hi' };

afterEach(() => vi.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// PHASE E — CONNECTOR FAILURE MATRIX
// 14 deterministic scenarios covering every path.
// For each scenario: verifies selected connector, fallback, result, edge calls.
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase E — Connector failure matrix', () => {

  // ── E1: No connectors ──────────────────────────────────────────────────────
  it('E1: no connectors → hasUsableConnectors=false, execute throws NO_CONNECTORS', async () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    const svc = makeSvc();
    expect(svc.hasUsableConnectors()).toBe(false);
    await expect(svc.execute(REQ)).rejects.toMatchObject({ code: 'NO_CONNECTORS' });
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // ── E2: One healthy free connector (Ollama) ────────────────────────────────
  it('E2: one healthy Ollama connector → routes through it, no edge call', async () => {
    const c = mockConnector('ollama');
    vi.mocked(aiConnectorStore.list).mockReturnValue([makeConnector('ollama', 'ollama')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(false);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(c as never);

    const resp = await makeSvc().execute(REQ);
    expect(resp.connector).toBe('ollama');
    expect(c.execute).toHaveBeenCalledOnce();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // ── E3: Free connector unavailable (network error) ─────────────────────────
  it('E3: Ollama unavailable (throws) → execute throws, no edge call', async () => {
    const c = mockConnector('ollama', { executeResult: 'throw' });
    vi.mocked(aiConnectorStore.list).mockReturnValue([makeConnector('ollama', 'ollama')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(c as never);

    const svc = makeSvc();
    await expect(svc.execute(REQ)).rejects.toThrow();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // ── E4: Free connector returns malformed response ──────────────────────────
  it('E4: connector returns malformed JSON text → execute resolves (raw text returned)', async () => {
    const c = mockConnector('ollama', { executeResult: 'malformed' });
    vi.mocked(aiConnectorStore.list).mockReturnValue([makeConnector('ollama', 'ollama')] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(c as never);

    // The orchestrator returns the raw AIResponse — parsing happens in the feature engine.
    const resp = await makeSvc().execute(REQ);
    expect(resp.text).toContain('not valid json');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // ── E5: Free connector rate limited ───────────────────────────────────────
  it('E5: Ollama rate limited → falls back to next connector', async () => {
    const bad  = mockConnector('ollama',  { executeResult: 'rate_limit', ...{ priority: 1 } });
    const good = mockConnector('gemini');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('ollama',  'ollama',  { priority: 1 }),
      makeConnector('gemini',  'gemini',  { priority: 2 }),
    ] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockImplementation(id => id === 'gemini');
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(cfg =>
      cfg.id === 'ollama' ? (bad as never) : (good as never),
    );

    const resp = await makeSvc().execute(REQ);
    expect(resp.connector).toBe('gemini');
    expect(bad.execute).toHaveBeenCalled();
    expect(good.execute).toHaveBeenCalledOnce();
  });

  // ── E6: Free connector times out ──────────────────────────────────────────
  it('E6: Ollama timeout → falls back to next connector', async () => {
    const timedOut = mockConnector('ollama', { executeResult: 'timeout' });
    const fallback = mockConnector('gemini');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('ollama', 'ollama', { priority: 1 }),
      makeConnector('gemini', 'gemini', { priority: 2 }),
    ] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockImplementation(id => id === 'gemini');
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(cfg =>
      cfg.id === 'ollama' ? (timedOut as never) : (fallback as never),
    );

    const resp = await makeSvc().execute(REQ);
    expect(resp.connector).toBe('gemini');
  });

  // ── E7: User API connector succeeds ──────────────────────────────────────
  it('E7: Gemini with user API key → routes through it, no edge call', async () => {
    const c = mockConnector('gemini');
    vi.mocked(aiConnectorStore.list).mockReturnValue([makeConnector('gemini')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(true);
    vi.mocked(secureCredentialStore.retrieve).mockReturnValue({
      reveal: () => 'AIza-test-key', toString: () => '[REDACTED]', toJSON: () => '[REDACTED]',
      isPresent: () => true,
    } as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(c as never);

    const resp = await makeSvc().execute(REQ);
    expect(resp.connector).toBe('gemini');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // ── E8: User API connector rejects credentials ────────────────────────────
  it('E8: Gemini auth failure → throws AUTH_FAILED, no edge call', async () => {
    const c = mockConnector('gemini', { executeResult: 'auth_fail' });
    vi.mocked(aiConnectorStore.list).mockReturnValue([makeConnector('gemini')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(true);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(c as never);

    await expect(makeSvc().execute(REQ)).rejects.toThrow('Authentication failed');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // ── E9: MCP server unavailable (connect throws) ───────────────────────────
  it('E9: MCP connect fails → connector skipped, hasUsableConnectors=false', async () => {
    const mcpC = mockConnector('mcp_1', { connect: 'throw' });
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('mcp_1', 'mcp', { mcpTransport: 'sse', mcpEndpoint: 'http://mcp.local' }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mcpC as never);

    const svc = makeSvc();
    // MCP connector passes _isMCPUsable filter (has endpoint+sse), gets built, but connect() throws → skipped
    await expect(svc.execute(REQ)).rejects.toMatchObject({ code: 'NO_CONNECTORS' });
  });

  // ── E10: MCP auth failure (execute throws) ────────────────────────────────
  it('E10: MCP auth failure during execute → throws, no edge call', async () => {
    const mcpC = mockConnector('mcp_1', { executeResult: 'auth_fail' });
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('mcp_1', 'mcp', { mcpTransport: 'sse', mcpEndpoint: 'http://mcp.local' }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mcpC as never);

    await expect(makeSvc().execute(REQ)).rejects.toThrow('Authentication failed');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // ── E11: MCP malformed response ───────────────────────────────────────────
  it('E11: MCP returns malformed JSON text → execute resolves with raw text', async () => {
    const mcpC = mockConnector('mcp_1', { executeResult: 'malformed' });
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('mcp_1', 'mcp', { mcpTransport: 'sse', mcpEndpoint: 'http://mcp.local' }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mcpC as never);

    const resp = await makeSvc().execute(REQ);
    expect(resp.text).toContain('not valid json');
  });

  // ── E12: All connectors fail ──────────────────────────────────────────────
  it('E12: all connectors fail → throws (not silent)', async () => {
    const bad1 = mockConnector('ollama', { executeResult: 'throw' });
    const bad2 = mockConnector('gemini', { executeResult: 'throw' });
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('ollama', 'ollama', { priority: 1 }),
      makeConnector('gemini', 'gemini', { priority: 2 }),
    ] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockImplementation(id => id === 'gemini');
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(cfg =>
      cfg.id === 'ollama' ? (bad1 as never) : (bad2 as never),
    );

    await expect(makeSvc().execute(REQ)).rejects.toThrow();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // ── E13: Edge fallback disabled (default) ────────────────────────────────
  it('E13: no connectors, edge disabled → hasUsableConnectors=false, no edge call', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    vi.mocked(aiRuntimePolicy.isEdgeFunctionEnabled).mockReturnValue(false);

    const svc = makeSvc();
    expect(svc.hasUsableConnectors()).toBe(false);
    expect(svc.getStatus().edgeFunctionEnabled).toBe(false);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // ── E14: Edge fallback enabled ────────────────────────────────────────────
  it('E14: no connectors, edge enabled → getStatus reflects it, orchestrator still throws NO_CONNECTORS', async () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    vi.mocked(aiRuntimePolicy.isEdgeFunctionEnabled).mockReturnValue(true);

    const svc = makeSvc();
    expect(svc.getStatus().edgeFunctionEnabled).toBe(true);
    // The orchestration service itself throws — the feature engine routes to edge.
    await expect(svc.execute(REQ)).rejects.toMatchObject({ code: 'NO_CONNECTORS' });
  });

  // ── E15: Gemini without session key is NOT counted as usable ─────────────
  it('E15: Gemini connector present but session key expired → hasUsableConnectors=false', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makeConnector('gemini')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(false); // session expired

    expect(makeSvc().hasUsableConnectors()).toBe(false);
    expect(AIConnectorFactory.fromConfig).not.toHaveBeenCalled();
  });

  // ── E16: Gemini WITH session key is counted as usable ────────────────────
  it('E16: Gemini connector present with valid session key → hasUsableConnectors=true', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makeConnector('gemini')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(true);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mockConnector('gemini') as never);

    expect(makeSvc().hasUsableConnectors()).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE F — MCP LIFECYCLE
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase F — MCP lifecycle', () => {

  it('F1: concurrent execute() calls coalesce — MCP connector connected exactly once', async () => {
    const mcpC = mockConnector('mcp_1');
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('mcp_1', 'mcp', { mcpTransport: 'sse', mcpEndpoint: 'http://mcp.local' }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mcpC as never);

    const svc = makeSvc();
    // Launch 5 concurrent execute calls
    await Promise.all([
      svc.execute(REQ), svc.execute(REQ), svc.execute(REQ),
      svc.execute(REQ), svc.execute(REQ),
    ]);

    // connect() must be called only once regardless of concurrency
    expect(mcpC.connect).toHaveBeenCalledTimes(1);
  });

  it('F2: invalidate() disconnects old MCP connector before rebuild', async () => {
    const disconnectSpy = vi.fn().mockResolvedValue(undefined);
    const mcpC = mockConnector('mcp_1', { disconnect: disconnectSpy });
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('mcp_1', 'mcp', { mcpTransport: 'sse', mcpEndpoint: 'http://mcp.local' }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mcpC as never);

    const svc = makeSvc();
    await svc.execute(REQ); // builds orchestrator, connects MCP

    svc.invalidate(); // should call disconnect() on old MCP connector
    // disconnect is best-effort async — give microtasks a tick
    await Promise.resolve();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('F3: invalidate() then rebuild reconnects MCP connector fresh', async () => {
    const disconnectSpy = vi.fn().mockResolvedValue(undefined);
    const mcpC = mockConnector('mcp_1', { disconnect: disconnectSpy });
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('mcp_1', 'mcp', { mcpTransport: 'sse', mcpEndpoint: 'http://mcp.local' }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mcpC as never);

    const svc = makeSvc();
    await svc.execute(REQ); // first build — connect #1
    svc.invalidate();
    await svc.execute(REQ); // second build — connect #2

    expect(mcpC.connect).toHaveBeenCalledTimes(2);
  });

  it('F4: MCP connect failure causes connector to be skipped gracefully', async () => {
    const mcpC = mockConnector('mcp_1', { connect: 'throw' });
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('mcp_1', 'mcp', { mcpTransport: 'sse', mcpEndpoint: 'http://mcp.local' }),
    ] as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mcpC as never);

    const svc = makeSvc();
    // Should throw NO_CONNECTORS (connector skipped), not the raw connect error
    await expect(svc.execute(REQ)).rejects.toMatchObject({ code: 'NO_CONNECTORS' });
  });

  it('F5: stdio MCP connector is excluded from usable set (no endpoint)', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('mcp_stdio', 'mcp', { mcpTransport: 'stdio', mcpEndpoint: undefined }),
    ] as never);

    expect(makeSvc().hasUsableConnectors()).toBe(false);
  });

  it('F6: MCP without endpoint is excluded from usable set', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([
      makeConnector('mcp_no_ep', 'mcp', { mcpTransport: 'websocket', mcpEndpoint: undefined }),
    ] as never);

    expect(makeSvc().hasUsableConnectors()).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE G — MODEL DISCOVERY REGRESSION
// Verifies the M7 fix: discoverModels/discoverModelsFromEndpoint never touches
// the connector store and cannot overwrite or delete existing connector data.
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase G — Model discovery regression (M7 fix cannot revert)', () => {

  // We test aiConnectorService (not the service impl above) for discovery.
  // Import inline to keep module mock scope clean.

  it('G1: discoverModelsFromEndpoint uses id=__discovery__ (never touches real connectors)', async () => {
    // Import after mocks are registered
    const { aiConnectorService } = await import('@/features/ai-connectors/aiConnectorService');

    const fakeList = vi.fn().mockReturnValue([]);
    vi.mocked(aiConnectorStore.list).mockImplementation(fakeList);
    vi.mocked(aiConnectorStore.get).mockReturnValue(undefined);

    const mockOllamaC = {
      id: '__discovery__',
      listModels: vi.fn().mockResolvedValue(['llama3.2', 'phi3']),
      capabilities: vi.fn().mockReturnValue(CAPS_JSON),
      health: vi.fn().mockResolvedValue({ status: 'connected', checkedAt: now }),
      execute: vi.fn(), stream: vi.fn(), cancel: vi.fn(),
      configurationSchema: vi.fn().mockReturnValue({ fields: [] }),
    };
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mockOllamaC as never);

    const models = await aiConnectorService.discoverModelsFromEndpoint('http://localhost:11434');

    // Must use id='__discovery__' so it never matches a real connector
    const cfgUsed = vi.mocked(AIConnectorFactory.fromConfig).mock.calls[0][0];
    expect(cfgUsed.id).toBe('__discovery__');
    expect(cfgUsed.enabled).toBe(false);
    expect(cfgUsed.priority).toBe(999);

    // Store must never be written
    expect(aiConnectorStore.add).not.toHaveBeenCalled();
    expect(aiConnectorStore.update).not.toHaveBeenCalled();
    expect(aiConnectorStore.remove).not.toHaveBeenCalled();

    expect(models).toContain('llama3.2');
    expect(models).toContain('phi3');
  });

  it('G2: discoverModels for unknown id returns [] without touching store', async () => {
    const { aiConnectorService } = await import('@/features/ai-connectors/aiConnectorService');
    vi.mocked(aiConnectorStore.get).mockReturnValue(undefined);

    const models = await aiConnectorService.discoverModels('nonexistent');

    expect(models).toEqual([]);
    expect(aiConnectorStore.add).not.toHaveBeenCalled();
    expect(aiConnectorStore.update).not.toHaveBeenCalled();
  });

  it('G3: discoverModels for non-ollama connector returns []', async () => {
    const { aiConnectorService } = await import('@/features/ai-connectors/aiConnectorService');
    vi.mocked(aiConnectorStore.get).mockReturnValue(makeConnector('gemini') as never);

    const models = await aiConnectorService.discoverModels('gemini');

    expect(models).toEqual([]);
    expect(AIConnectorFactory.fromConfig).not.toHaveBeenCalled();
  });

  it('G4: discoverModelsFromEndpoint failure returns [] without throwing', async () => {
    const { aiConnectorService } = await import('@/features/ai-connectors/aiConnectorService');
    vi.mocked(AIConnectorFactory.fromConfig).mockImplementation(() => {
      throw new Error('network unreachable');
    });

    const models = await aiConnectorService.discoverModelsFromEndpoint('http://bad-host:11434');
    expect(models).toEqual([]);
  });

  it('G5: listModels() returning [] does not modify existing connector priority or enabled state', async () => {
    const { aiConnectorService } = await import('@/features/ai-connectors/aiConnectorService');
    const existing = makeConnector('ollama', 'ollama', { priority: 5, enabled: true });
    vi.mocked(aiConnectorStore.get).mockReturnValue(existing as never);

    const mockOllamaC = {
      listModels: vi.fn().mockResolvedValue([]),
      capabilities: vi.fn().mockReturnValue(CAPS_JSON),
      health: vi.fn().mockResolvedValue({ status: 'connected', checkedAt: now }),
      execute: vi.fn(), stream: vi.fn(), cancel: vi.fn(),
      configurationSchema: vi.fn().mockReturnValue({ fields: [] }),
    };
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(mockOllamaC as never);

    await aiConnectorService.discoverModels('ollama');

    // Store must not be touched
    expect(aiConnectorStore.update).not.toHaveBeenCalled();
    expect(aiConnectorStore.remove).not.toHaveBeenCalled();
    // Original connector unchanged
    expect(existing.priority).toBe(5);
    expect(existing.enabled).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE I — API KEY AUDIT
// Secrets must never appear in: localStorage, logs, error messages, request bodies
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase I — API key audit', () => {

  it('I1: Gemini API key not passed inside AIRequest to connector.execute()', async () => {
    const c = mockConnector('gemini');
    vi.mocked(aiConnectorStore.list).mockReturnValue([makeConnector('gemini')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(true);
    vi.mocked(secureCredentialStore.retrieve).mockReturnValue({
      reveal: () => 'AIza-super-secret',
      toString: () => '[REDACTED]',
      toJSON: () => '[REDACTED]',
      isPresent: () => true,
    } as never);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(c as never);

    await makeSvc().execute(REQ);

    // The AIRequest passed to connector.execute() must not contain the raw key
    const req = vi.mocked(c.execute).mock.calls[0][0];
    expect(JSON.stringify(req)).not.toContain('AIza-super-secret');
  });

  it('I2: leaked Bearer token in error message is redacted in executeTestPrompt()', async () => {
    const bad = mockConnector('gemini');
    vi.mocked(bad.execute).mockRejectedValue(
      new Error('Auth failed: Bearer AIza-leaked-key-12345'),
    );
    vi.mocked(aiConnectorStore.list).mockReturnValue([makeConnector('gemini')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(true);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(bad as never);

    const result = await makeSvc().executeTestPrompt();
    expect(result.success).toBe(false);
    expect(result.error).not.toContain('AIza-leaked-key-12345');
    expect(result.error).toContain('[REDACTED]');
  });

  it('I3: edge function body sent by AIAnalysisEngine contains no API key pattern', async () => {
    vi.mocked(aiRuntimePolicy.isEdgeFunctionEnabled).mockReturnValue(true);

    const EDGE_RESP = {
      analysis: {
        rootCause: 'bug', confidence: 0.9, evidenceSummary: '', likelySourceFiles: [],
        suggestedFix: 'fix', regressionProbability: 0.1, developerExplanation: '', qaExplanation: '',
      },
      model: 'claude-sonnet-5', generationTime: 100,
    };
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: EDGE_RESP, error: null } as never);

    const { AIAnalysisEngine } = await import('@/services/failureAnalysis/AIAnalysisEngine');
    await new AIAnalysisEngine().analyze({} as never);

    const [, invokeArgs] = vi.mocked(supabase.functions.invoke).mock.calls[0]!;
    const bodyStr = JSON.stringify((invokeArgs as { body: unknown }).body ?? {});
    expect(bodyStr).not.toMatch(/sk-|AIza|Bearer\s\S|api[_-]?key/i);
  });

  it('I4: edge function body sent by AIRegressionEngine contains no API key pattern', async () => {
    vi.mocked(aiRuntimePolicy.isEdgeFunctionEnabled).mockReturnValue(true);

    const EDGE_RESP = {
      insight: {
        likelyRegressionAreas: [], untestedScenarios: [], suggestedRegressionSuite: [],
        highRiskModules: [], developerExplanation: '', qaExplanation: '', confidence: 0.7,
      },
      model: 'claude-sonnet-5', generationTime: 100,
    };
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: EDGE_RESP, error: null } as never);

    const { AIRegressionEngine } = await import('@/services/regressionAnalysis/AIRegressionEngine');
    await new AIRegressionEngine().analyze({
      projectType: 'react_web', fromVersion: 'v1', toVersion: 'v2',
      changedFiles: [], commitMessages: [], impactedAreas: [], riskScores: [], coverageResults: [],
    });

    const [, invokeArgs] = vi.mocked(supabase.functions.invoke).mock.calls[0]!;
    const bodyStr = JSON.stringify((invokeArgs as { body: unknown }).body ?? {});
    expect(bodyStr).not.toMatch(/sk-|AIza|Bearer\s\S|api[_-]?key/i);
  });

  it('I5: getStatus() never exposes raw API key values', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([makeConnector('gemini')] as never);
    vi.mocked(secureCredentialStore.hasSecret).mockReturnValue(true);

    const status = makeSvc().getStatus();
    const statusStr = JSON.stringify(status);
    expect(statusStr).not.toMatch(/AIza|sk-|Bearer/);
    // userApiKeyConfigured is a boolean, not the key value
    expect(typeof status.userApiKeyConfigured).toBe('boolean');
  });

  it('I6: requiresTestHubApiKey is always false', () => {
    vi.mocked(aiConnectorStore.list).mockReturnValue([]);
    expect(makeSvc().getStatus().requiresTestHubApiKey).toBe(false);
  });

  it('I7: Ollama connector has no API key in its factory config', async () => {
    const c = mockConnector('ollama');
    vi.mocked(aiConnectorStore.list).mockReturnValue([makeConnector('ollama', 'ollama')] as never);
    vi.mocked(secureCredentialStore.retrieve).mockReturnValue(undefined);
    vi.mocked(AIConnectorFactory.fromConfig).mockReturnValue(c as never);

    await makeSvc().execute(REQ);

    const cfg = vi.mocked(AIConnectorFactory.fromConfig).mock.calls[0][0];
    expect(cfg.userApiKey).toBeUndefined();
    expect(cfg.authMode).toBe('none');
  });
});
