import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { aiConnectorService } from '../../features/ai-connectors/aiConnectorService';
import { aiConnectorStore }   from '../../features/ai-connectors/aiConnectorStore';
import { secureCredentialStore } from '../../features/ai-connectors/secureCredentialStore';

// ─── Mock the AI platform layer ───────────────────────────────────────────────
// The service must use the factory/health abstractions, not instantiate connectors.

vi.mock('../../ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai')>();
  return {
    ...actual,
    AIConnectorFactory: {
      ...actual.AIConnectorFactory,
      fromConfig: vi.fn(() => ({
        id:           'gemini_flash',
        name:         'Gemini Flash',
        type:         'api_provider',
        health:       vi.fn().mockResolvedValue({ status: 'connected', latencyMs: 42, checkedAt: new Date().toISOString() }),
        capabilities: () => actual.ZERO_CAPABILITIES,
        execute:      vi.fn(),
        stream:       async function* () {},
        cancel:       vi.fn(),
        configurationSchema: () => ({ fields: [] }),
        connect:      vi.fn(),
        disconnect:   vi.fn(),
      })),
    },
    getDiagnostics: vi.fn().mockResolvedValue({
      connectorId:   'gemini_flash',
      connectorName: 'Gemini Flash',
      version:       '1.0.0',
      type:          'api_provider',
      model:         'gemini-2.0-flash',
      health:        { status: 'connected', latencyMs: 42, checkedAt: new Date().toISOString() },
      capabilities:  actual.ZERO_CAPABILITIES,
      snapshotAt:    new Date().toISOString(),
    }),
  };
});

beforeEach(() => {
  aiConnectorStore._reset();
  secureCredentialStore.clearAll();
  vi.clearAllMocks();
});

afterEach(() => {
  aiConnectorStore._reset();
  secureCredentialStore.clearAll();
});

// ─── Add connectors ───────────────────────────────────────────────────────────

describe('aiConnectorService — addGemini', () => {
  it('adds a Gemini record and stores key securely', () => {
    aiConnectorService.addGemini({
      displayName: 'My Gemini',
      apiKey:      'AIza-secret',
      model:       'gemini-2.0-flash',
      priority:    10,
      enabled:     true,
    });
    const list = aiConnectorService.list();
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('gemini');
    expect(list[0].displayName).toBe('My Gemini');
    // Key is in credential store, NOT in record
    expect(JSON.stringify(list[0])).not.toContain('AIza-secret');
    expect(secureCredentialStore.hasSecret('gemini')).toBe(true);
  });

  it('API key is never written to localStorage', () => {
    aiConnectorService.addGemini({
      displayName: 'My Gemini',
      apiKey:      'AIza-must-not-leak',
      model:       'gemini-2.0-flash',
      priority:    10,
      enabled:     true,
    });
    const stored = localStorage.getItem('testhub:ai_connectors:v1')!;
    expect(stored).not.toContain('must-not-leak');
  });

  it('second addGemini updates the singleton', () => {
    aiConnectorService.addGemini({ displayName: 'A', apiKey: 'k1', model: 'm', priority: 10, enabled: true });
    aiConnectorService.addGemini({ displayName: 'B', apiKey: 'k2', model: 'm2', priority: 20, enabled: false });
    expect(aiConnectorService.list()).toHaveLength(1);
    expect(aiConnectorService.list()[0].displayName).toBe('B');
  });
});

describe('aiConnectorService — addOllama', () => {
  it('adds Ollama record (no API key)', () => {
    aiConnectorService.addOllama({
      displayName: 'Local Ollama',
      endpoint:    'http://localhost:11434',
      model:       'llama3.2',
      priority:    20,
      enabled:     true,
    });
    const list = aiConnectorService.list();
    expect(list[0].kind).toBe('ollama');
    expect(list[0].endpoint).toBe('http://localhost:11434');
    // No secret stored for Ollama
    expect(secureCredentialStore.hasSecret('ollama')).toBe(false);
  });
});

describe('aiConnectorService — addOpenAICompat', () => {
  it('stores API key securely', () => {
    const r = aiConnectorService.addOpenAICompat({
      displayName: 'Groq',
      baseUrl:     'https://api.groq.com/openai/v1',
      apiKey:      'gsk-secret',
      model:       'llama3-70b-8192',
      priority:    50,
      enabled:     true,
    });
    expect(secureCredentialStore.hasSecret(r.id)).toBe(true);
    const stored = localStorage.getItem('testhub:ai_connectors:v1')!;
    expect(stored).not.toContain('gsk-secret');
  });

  it('allows no API key for local endpoints', () => {
    const r = aiConnectorService.addOpenAICompat({
      displayName: 'LM Studio',
      baseUrl:     'http://localhost:1234/v1',
      model:       'phi-3',
      priority:    50,
      enabled:     true,
    });
    expect(secureCredentialStore.hasSecret(r.id)).toBe(false);
  });

  it('can add multiple OAI-compatible connectors', () => {
    aiConnectorService.addOpenAICompat({ displayName: 'A', baseUrl: 'http://a/v1', model: 'x', priority: 50, enabled: true });
    aiConnectorService.addOpenAICompat({ displayName: 'B', baseUrl: 'http://b/v1', model: 'y', priority: 60, enabled: true });
    expect(aiConnectorService.list().filter(c => c.kind === 'openai_compatible')).toHaveLength(2);
  });
});

describe('aiConnectorService — addMCP', () => {
  it('adds MCP record', () => {
    const r = aiConnectorService.addMCP({
      displayName:  'My MCP Server',
      mcpTransport: 'stdio',
      mcpCommand:   'npx my-mcp-server',
      priority:     100,
      enabled:      true,
    });
    expect(r.kind).toBe('mcp');
    expect(r.mcpTransport).toBe('stdio');
    expect(r.mcpCommand).toBe('npx my-mcp-server');
  });
});

// ─── Enable / disable ─────────────────────────────────────────────────────────

describe('aiConnectorService — setEnabled', () => {
  it('disables a connector', () => {
    aiConnectorService.addGemini({ displayName: 'G', apiKey: 'k', model: 'm', priority: 10, enabled: true });
    aiConnectorService.setEnabled('gemini', false);
    expect(aiConnectorService.get('gemini')?.enabled).toBe(false);
  });

  it('enables a disabled connector', () => {
    aiConnectorService.addGemini({ displayName: 'G', apiKey: 'k', model: 'm', priority: 10, enabled: false });
    aiConnectorService.setEnabled('gemini', true);
    expect(aiConnectorService.get('gemini')?.enabled).toBe(true);
  });
});

// ─── Priority ─────────────────────────────────────────────────────────────────

describe('aiConnectorService — setPriority', () => {
  it('changes priority', () => {
    aiConnectorService.addGemini({ displayName: 'G', apiKey: 'k', model: 'm', priority: 10, enabled: true });
    aiConnectorService.setPriority('gemini', 50);
    expect(aiConnectorService.get('gemini')?.priority).toBe(50);
  });

  it('list() returns connectors sorted by priority ascending', () => {
    aiConnectorService.addGemini({ displayName: 'Gemini', apiKey: 'k', model: 'm', priority: 50, enabled: true });
    aiConnectorService.addOllama({ displayName: 'Ollama', endpoint: 'http://localhost:11434', model: 'llama', priority: 10, enabled: true });
    const ids = aiConnectorService.list().map(c => c.id);
    expect(ids[0]).toBe('ollama');
    expect(ids[1]).toBe('gemini');
  });
});

// ─── Default ─────────────────────────────────────────────────────────────────

describe('aiConnectorService — default connector', () => {
  it('getDefault returns undefined initially', () => {
    expect(aiConnectorService.getDefault()).toBeUndefined();
  });

  it('setDefault persists', () => {
    aiConnectorService.addGemini({ displayName: 'G', apiKey: 'k', model: 'm', priority: 10, enabled: true });
    aiConnectorService.setDefault('gemini');
    expect(aiConnectorService.getDefault()).toBe('gemini');
  });

  it('setDefault(undefined) clears', () => {
    aiConnectorService.setDefault('gemini');
    aiConnectorService.setDefault(undefined);
    expect(aiConnectorService.getDefault()).toBeUndefined();
  });
});

// ─── Delete ───────────────────────────────────────────────────────────────────

describe('aiConnectorService — remove', () => {
  it('removes connector and clears its API key', () => {
    aiConnectorService.addGemini({ displayName: 'G', apiKey: 'AIza-key', model: 'm', priority: 10, enabled: true });
    aiConnectorService.remove('gemini');
    expect(aiConnectorService.list()).toHaveLength(0);
    expect(secureCredentialStore.hasSecret('gemini')).toBe(false);
  });

  it('returns false for unknown id', () => {
    expect(aiConnectorService.remove('nobody')).toBe(false);
  });
});

// ─── Test connection ──────────────────────────────────────────────────────────

describe('aiConnectorService — testConnection', () => {
  it('returns success when health is connected', async () => {
    aiConnectorService.addGemini({ displayName: 'G', apiKey: 'AIza-key', model: 'm', priority: 10, enabled: true });
    const result = await aiConnectorService.testConnection('gemini');
    expect(result.success).toBe(true);
    expect(result.health?.status).toBe('connected');
  });

  it('returns failure for unknown connector', async () => {
    const result = await aiConnectorService.testConnection('nobody');
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBeTruthy();
  });

  it('MCP connector returns failure with helpful message', async () => {
    aiConnectorService.addMCP({ displayName: 'MCP', mcpTransport: 'stdio', mcpCommand: 'cmd', priority: 100, enabled: true });
    const ids = aiConnectorService.list().filter(c => c.kind === 'mcp').map(c => c.id);
    const result = await aiConnectorService.testConnection(ids[0]);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBeTruthy();
    expect(result.suggestedFix).toBeTruthy();
  });

  it('test result never contains raw API key', async () => {
    aiConnectorService.addGemini({ displayName: 'G', apiKey: 'AIza-must-not-appear', model: 'm', priority: 10, enabled: true });
    const result = await aiConnectorService.testConnection('gemini');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('must-not-appear');
  });
});

// ─── Diagnostics ─────────────────────────────────────────────────────────────

describe('aiConnectorService — getDiagnostics', () => {
  it('returns a diagnostic report for a non-MCP connector', async () => {
    aiConnectorService.addGemini({ displayName: 'G', apiKey: 'AIza-key', model: 'm', priority: 10, enabled: true });
    const report = await aiConnectorService.getDiagnostics('gemini');
    expect(report).not.toBeNull();
    expect(report?.connectorId).toBe('gemini_flash');
  });

  it('returns null for MCP connector', async () => {
    aiConnectorService.addMCP({ displayName: 'MCP', mcpTransport: 'stdio', mcpCommand: 'cmd', priority: 100, enabled: true });
    const ids = aiConnectorService.list().filter(c => c.kind === 'mcp').map(c => c.id);
    const report = await aiConnectorService.getDiagnostics(ids[0]);
    expect(report).toBeNull();
  });

  it('diagnostics report never contains raw API key', async () => {
    aiConnectorService.addGemini({ displayName: 'G', apiKey: 'AIza-diag-secret', model: 'm', priority: 10, enabled: true });
    const report = await aiConnectorService.getDiagnostics('gemini');
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('diag-secret');
  });
});

// ─── hasApiKey ────────────────────────────────────────────────────────────────

describe('aiConnectorService — hasApiKey', () => {
  it('returns true when key was stored', () => {
    aiConnectorService.addGemini({ displayName: 'G', apiKey: 'AIza-key', model: 'm', priority: 10, enabled: true });
    expect(aiConnectorService.hasApiKey('gemini')).toBe(true);
  });

  it('returns false for Ollama (no key)', () => {
    aiConnectorService.addOllama({ displayName: 'O', endpoint: 'http://localhost:11434', model: 'llama3', priority: 20, enabled: true });
    expect(aiConnectorService.hasApiKey('ollama')).toBe(false);
  });
});
