import { describe, it, expect, beforeEach } from 'vitest';
import { AIConnectorRegistry }              from '../../ai/registry/AIConnectorRegistry';
import type { IAIConnector }               from '../../ai/core/IAIConnector';
import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIConnectorCapabilities,
  ConnectorHealth,
  ConnectorConfigSchema,
  ConnectorType,
} from '../../ai/types/AITypes';
import { ZERO_CAPABILITIES }               from '../../ai/types/AITypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConnector(
  id:            string,
  overrides?:    Partial<AIConnectorCapabilities>,
  healthStatus?: ConnectorHealth['status'],
): IAIConnector {
  return {
    id,
    name: `Connector-${id}`,
    type: 'api_provider' as ConnectorType,
    async connect()    {},
    async disconnect() {},
    async health(): Promise<ConnectorHealth> {
      return { status: healthStatus ?? 'connected', checkedAt: new Date().toISOString() };
    },
    capabilities(): AIConnectorCapabilities {
      return { ...ZERO_CAPABILITIES, ...overrides };
    },
    async execute(_r: AIRequest): Promise<AIResponse> {
      return {
        requestId: _r.requestId,
        text: `ok from ${id}`,
        reasoningAvailable: false,
        latency: 1,
        provider: id,
        connector: id,
        model: 'mock',
      };
    },
    // eslint-disable-next-line require-yield
    async *stream(_r: AIRequest): AsyncGenerator<AIStreamChunk> {
      throw new Error('not implemented');
    },
    async cancel(_requestId: string) {},
    configurationSchema(): ConnectorConfigSchema { return { fields: [] }; },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AIConnectorRegistry — registration', () => {
  let registry: AIConnectorRegistry;
  beforeEach(() => { registry = new AIConnectorRegistry(); });

  it('registers a connector', () => {
    registry.register(makeConnector('a'));
    expect(registry.size()).toBe(1);
  });

  it('retrieves a registered connector by id', () => {
    const c = makeConnector('a');
    registry.register(c);
    expect(registry.get('a')).toBe(c);
  });

  it('throws on duplicate registration', () => {
    registry.register(makeConnector('a'));
    expect(() => registry.register(makeConnector('a'))).toThrow(/already registered/);
  });

  it('unregisters a connector', () => {
    registry.register(makeConnector('a'));
    expect(registry.unregister('a')).toBe(true);
    expect(registry.get('a')).toBeUndefined();
  });

  it('unregister returns false for unknown id', () => {
    expect(registry.unregister('not-there')).toBe(false);
  });

  it('clear removes all connectors', () => {
    registry.register(makeConnector('a'));
    registry.register(makeConnector('b'));
    registry.clear();
    expect(registry.size()).toBe(0);
  });

  it('getEntry returns undefined for unknown id', () => {
    expect(registry.getEntry('x')).toBeUndefined();
  });

  it('stores registeredAt timestamp', () => {
    registry.register(makeConnector('a'));
    const entry = registry.getEntry('a');
    expect(typeof entry?.registeredAt).toBe('string');
  });
});

describe('AIConnectorRegistry — listing and priority', () => {
  let registry: AIConnectorRegistry;
  beforeEach(() => { registry = new AIConnectorRegistry(); });

  it('list() returns all connectors regardless of enabled state', () => {
    registry.register(makeConnector('a'), { priority: 10 });
    registry.register(makeConnector('b'), { priority: 20, enabled: false });
    expect(registry.list()).toHaveLength(2);
  });

  it('listEnabled() excludes disabled connectors', () => {
    registry.register(makeConnector('a'));
    registry.register(makeConnector('b'), { enabled: false });
    const enabled = registry.listEnabled();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].connector.id).toBe('a');
  });

  it('listEnabled() sorts ascending by priority', () => {
    registry.register(makeConnector('low'),  { priority: 200 });
    registry.register(makeConnector('high'), { priority: 10 });
    registry.register(makeConnector('mid'),  { priority: 100 });

    const ids = registry.listEnabled().map(e => e.connector.id);
    expect(ids).toEqual(['high', 'mid', 'low']);
  });

  it('default priority is 100', () => {
    registry.register(makeConnector('a'));
    expect(registry.getEntry('a')?.priority).toBe(100);
  });
});

describe('AIConnectorRegistry — enable/disable', () => {
  let registry: AIConnectorRegistry;
  beforeEach(() => { registry = new AIConnectorRegistry(); });

  it('setEnabled(false) excludes connector from listEnabled()', () => {
    registry.register(makeConnector('a'));
    registry.setEnabled('a', false);
    expect(registry.listEnabled()).toHaveLength(0);
  });

  it('setEnabled(true) re-includes a disabled connector', () => {
    registry.register(makeConnector('a'), { enabled: false });
    registry.setEnabled('a', true);
    expect(registry.listEnabled()).toHaveLength(1);
  });

  it('setEnabled returns false for unknown id', () => {
    expect(registry.setEnabled('unknown', true)).toBe(false);
  });
});

describe('AIConnectorRegistry — capability filtering', () => {
  let registry: AIConnectorRegistry;
  beforeEach(() => { registry = new AIConnectorRegistry(); });

  it('findByCapability returns connectors matching predicate', () => {
    registry.register(makeConnector('vision',    { supportsVision: true }),  { priority: 1 });
    registry.register(makeConnector('no-vision', { supportsVision: false }), { priority: 2 });

    const found = registry.findByCapability(c => c.supportsVision);
    expect(found).toHaveLength(1);
    expect(found[0].connector.id).toBe('vision');
  });

  it('findByCapability returns empty array when no match', () => {
    registry.register(makeConnector('a', { supportsStreaming: false }));
    expect(registry.findByCapability(c => c.supportsStreaming)).toHaveLength(0);
  });

  it('findByCapability excludes disabled connectors', () => {
    registry.register(makeConnector('a', { supportsTools: true }), { enabled: false });
    expect(registry.findByCapability(c => c.supportsTools)).toHaveLength(0);
  });

  it('findByCapability result is priority-sorted', () => {
    registry.register(makeConnector('b', { supportsJSON: true }), { priority: 200 });
    registry.register(makeConnector('a', { supportsJSON: true }), { priority: 50 });
    const ids = registry.findByCapability(c => c.supportsJSON).map(e => e.connector.id);
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('AIConnectorRegistry — health checks', () => {
  let registry: AIConnectorRegistry;
  beforeEach(() => { registry = new AIConnectorRegistry(); });

  it('checkHealth returns undefined for unknown id', async () => {
    expect(await registry.checkHealth('x')).toBeUndefined();
  });

  it('checkHealth returns and stores health result', async () => {
    registry.register(makeConnector('a', {}, 'connected'));
    const health = await registry.checkHealth('a');
    expect(health?.status).toBe('connected');
    expect(registry.getEntry('a')?.lastHealth?.status).toBe('connected');
  });

  it('checkAllHealth returns health for all registered connectors', async () => {
    registry.register(makeConnector('a', {}, 'connected'));
    registry.register(makeConnector('b', {}, 'error'));
    const results = await registry.checkAllHealth();
    expect(results.size).toBe(2);
    expect(results.get('a')?.status).toBe('connected');
    expect(results.get('b')?.status).toBe('error');
  });

  it('checkAllHealth continues when one connector throws', async () => {
    const throwing: IAIConnector = {
      ...makeConnector('throws'),
      async health(): Promise<ConnectorHealth> { throw new Error('network error'); },
    };
    registry.register(throwing);
    registry.register(makeConnector('ok', {}, 'connected'));
    const results = await registry.checkAllHealth();
    expect(results.get('ok')?.status).toBe('connected');
  });
});
