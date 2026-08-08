import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectorHealthMonitor }   from '../../ai/health/ConnectorHealthMonitor';
import { AIOrchestrator }          from '../../ai/orchestrator/AIOrchestrator';
import { AIConnectorRegistry }     from '../../ai/registry/AIConnectorRegistry';
import { ZERO_CAPABILITIES }       from '../../ai/types/AITypes';
import type { IAIConnector }       from '../../ai/core/IAIConnector';
import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIConnectorCapabilities,
  ConnectorHealth,
  ConnectorConfigSchema,
  ConnectorType,
} from '../../ai/types/AITypes';
import { makeRequest }             from './helpers/testHelpers';

// ─── Mock connector ───────────────────────────────────────────────────────────

class MockConnector implements IAIConnector {
  callCount  = 0;
  shouldFail = false;

  constructor(
    readonly id:   string,
    readonly name: string,
    readonly type: ConnectorType = 'api_provider',
  ) {}

  async connect()    {}
  async disconnect() {}

  async health(): Promise<ConnectorHealth> {
    return { status: 'connected', latencyMs: 5, checkedAt: new Date().toISOString() };
  }

  capabilities(): AIConnectorCapabilities { return { ...ZERO_CAPABILITIES }; }

  async execute(req: AIRequest): Promise<AIResponse> {
    this.callCount++;
    if (this.shouldFail) throw new Error('Simulated failure');
    return {
      requestId: req.requestId, text: 'ok', reasoningAvailable: false,
      latency: 10, provider: this.name, connector: this.id, model: 'mock',
    };
  }

  // eslint-disable-next-line require-yield
  async *stream(_r: AIRequest): AsyncGenerator<AIStreamChunk> { throw new Error('no'); }
  async cancel(_id: string): Promise<void> {}
  configurationSchema(): ConnectorConfigSchema { return { fields: [] }; }
}

const NO_SLEEP = () => Promise.resolve();

function makeOrch(
  registry: AIConnectorRegistry,
  monitor:  ConnectorHealthMonitor,
) {
  return new AIOrchestrator(
    registry,
    {
      retry:              { maxAttempts: 1, initialDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0 },
      timeoutMs:          60_000,
      requireHealthCheck: false,
      fallbackEnabled:    true,
      telemetryHooks:     [monitor],
    },
    NO_SLEEP,
  );
}

// ─── Basic recording ──────────────────────────────────────────────────────────

describe('ConnectorHealthMonitor — basic recording', () => {
  let monitor:  ConnectorHealthMonitor;
  let registry: AIConnectorRegistry;

  beforeEach(() => {
    monitor  = new ConnectorHealthMonitor();
    registry = new AIConnectorRegistry();
  });

  it('returns undefined for unknown connector', () => {
    expect(monitor.getStats('nobody')).toBeUndefined();
  });

  it('records success from orchestrator telemetry', async () => {
    const c = new MockConnector('a', 'A');
    registry.register(c);
    await makeOrch(registry, monitor).execute(makeRequest());
    expect(monitor.getStats('a')?.successCount).toBe(1);
    expect(monitor.getStats('a')?.requestCount).toBe(1);
  });

  it('records failure from orchestrator telemetry', async () => {
    const c = new MockConnector('b', 'B');
    c.shouldFail = true;
    registry.register(c);
    await expect(makeOrch(registry, monitor).execute(makeRequest())).rejects.toBeTruthy();
    expect(monitor.getStats('b')?.failureCount).toBe(1);
  });

  it('availability = successCount / requestCount', async () => {
    const c = new MockConnector('c', 'C');
    registry.register(c);
    const orch = makeOrch(registry, monitor);
    await orch.execute(makeRequest());
    await orch.execute(makeRequest());
    c.shouldFail = true;
    await expect(orch.execute(makeRequest())).rejects.toBeTruthy();
    const s = monitor.getStats('c')!;
    expect(s.requestCount).toBe(3);
    expect(s.successCount).toBe(2);
    expect(s.availability).toBeCloseTo(2 / 3);
  });

  it('status becomes connected after success', async () => {
    const c = new MockConnector('d', 'D');
    registry.register(c);
    await makeOrch(registry, monitor).execute(makeRequest());
    expect(monitor.getStats('d')?.status).toBe('connected');
  });

  it('status becomes error after failure with no prior successes', async () => {
    const c = new MockConnector('e', 'E');
    c.shouldFail = true;
    registry.register(c);
    await expect(makeOrch(registry, monitor).execute(makeRequest())).rejects.toBeTruthy();
    expect(monitor.getStats('e')?.status).toBe('error');
  });

  it('status becomes degraded after failure following success', async () => {
    const c = new MockConnector('f', 'F');
    registry.register(c);
    const orch = makeOrch(registry, monitor);
    await orch.execute(makeRequest());
    c.shouldFail = true;
    await expect(orch.execute(makeRequest())).rejects.toBeTruthy();
    expect(monitor.getStats('f')?.status).toBe('degraded');
  });
});

// ─── Timestamp recording ──────────────────────────────────────────────────────

describe('ConnectorHealthMonitor — timestamps', () => {
  let monitor:  ConnectorHealthMonitor;
  let registry: AIConnectorRegistry;

  beforeEach(() => {
    monitor  = new ConnectorHealthMonitor();
    registry = new AIConnectorRegistry();
  });

  it('records lastSuccessAt after success', async () => {
    const c = new MockConnector('a', 'A');
    registry.register(c);
    await makeOrch(registry, monitor).execute(makeRequest());
    expect(monitor.getStats('a')?.lastSuccessAt).toBeTruthy();
  });

  it('records lastFailureAt after failure', async () => {
    const c = new MockConnector('b', 'B');
    c.shouldFail = true;
    registry.register(c);
    await expect(makeOrch(registry, monitor).execute(makeRequest())).rejects.toBeTruthy();
    expect(monitor.getStats('b')?.lastFailureAt).toBeTruthy();
  });

  it('records lastFailureError message', async () => {
    const c = new MockConnector('c', 'C');
    c.shouldFail = true;
    registry.register(c);
    await expect(makeOrch(registry, monitor).execute(makeRequest())).rejects.toBeTruthy();
    expect(monitor.getStats('c')?.lastFailureError).toBeTruthy();
  });

  it('firstSeenAt is set on first event', async () => {
    const c = new MockConnector('d', 'D');
    registry.register(c);
    await makeOrch(registry, monitor).execute(makeRequest());
    expect(typeof monitor.getStats('d')?.firstSeenAt).toBe('string');
  });
});

// ─── Health recording ─────────────────────────────────────────────────────────

describe('ConnectorHealthMonitor — recordHealth()', () => {
  let monitor: ConnectorHealthMonitor;

  beforeEach(() => { monitor = new ConnectorHealthMonitor(); });

  it('updates status from health check', () => {
    monitor.recordHealth('x', { status: 'connected', latencyMs: 12, checkedAt: new Date().toISOString() });
    expect(monitor.getStatus('x')).toBe('connected');
  });

  it('updates latencyMsLast from health check', () => {
    monitor.recordHealth('x', { status: 'connected', latencyMs: 42, checkedAt: new Date().toISOString() });
    expect(monitor.getStats('x')?.latencyMsLast).toBe(42);
  });

  it('sets lastSuccessAt on connected health', () => {
    const now = new Date().toISOString();
    monitor.recordHealth('x', { status: 'connected', checkedAt: now });
    expect(monitor.getStats('x')?.lastSuccessAt).toBe(now);
  });

  it('sets lastFailureAt on error health', () => {
    const now = new Date().toISOString();
    monitor.recordHealth('x', { status: 'error', checkedAt: now });
    expect(monitor.getStats('x')?.lastFailureAt).toBe(now);
  });
});

// ─── Latency ─────────────────────────────────────────────────────────────────

describe('ConnectorHealthMonitor — latency tracking', () => {
  it('latencyMsAvg is computed as rolling average', () => {
    const monitor = new ConnectorHealthMonitor();
    monitor.recordHealth('x', { status: 'connected', latencyMs: 100, checkedAt: '' });
    monitor.recordHealth('x', { status: 'connected', latencyMs: 200, checkedAt: '' });
    expect(monitor.getStats('x')?.latencyMsAvg).toBe(150);
  });
});

// ─── getAllStats ──────────────────────────────────────────────────────────────

describe('ConnectorHealthMonitor — getAllStats()', () => {
  it('returns stats for all seen connectors', async () => {
    const monitor  = new ConnectorHealthMonitor();
    const registry = new AIConnectorRegistry();
    const a = new MockConnector('a', 'A');
    const b = new MockConnector('b', 'B');
    registry.register(a, { priority: 1 });
    registry.register(b, { priority: 2 });
    const orch = makeOrch(registry, monitor);
    await orch.execute(makeRequest());
    expect(monitor.getAllStats().length).toBeGreaterThanOrEqual(1);
  });
});

// ─── isHealthy / getAvailability ─────────────────────────────────────────────

describe('ConnectorHealthMonitor — isHealthy / getAvailability', () => {
  it('isHealthy() returns false for unknown connector', () => {
    expect(new ConnectorHealthMonitor().isHealthy('x')).toBe(false);
  });

  it('isHealthy() returns true after success', async () => {
    const monitor  = new ConnectorHealthMonitor();
    const registry = new AIConnectorRegistry();
    registry.register(new MockConnector('a', 'A'));
    await makeOrch(registry, monitor).execute(makeRequest());
    expect(monitor.isHealthy('a')).toBe(true);
  });

  it('getAvailability() returns 0 for unknown connector', () => {
    expect(new ConnectorHealthMonitor().getAvailability('x')).toBe(0);
  });
});

// ─── reset ───────────────────────────────────────────────────────────────────

describe('ConnectorHealthMonitor — reset()', () => {
  it('reset(id) clears a single connector', async () => {
    const monitor  = new ConnectorHealthMonitor();
    const registry = new AIConnectorRegistry();
    registry.register(new MockConnector('a', 'A'));
    await makeOrch(registry, monitor).execute(makeRequest());
    monitor.reset('a');
    expect(monitor.getStats('a')).toBeUndefined();
  });

  it('reset() with no arg clears all connectors', async () => {
    const monitor  = new ConnectorHealthMonitor();
    const registry = new AIConnectorRegistry();
    registry.register(new MockConnector('a', 'A'));
    registry.register(new MockConnector('b', 'B'));
    await makeOrch(registry, monitor).execute(makeRequest());
    monitor.reset();
    expect(monitor.getAllStats()).toHaveLength(0);
  });
});
