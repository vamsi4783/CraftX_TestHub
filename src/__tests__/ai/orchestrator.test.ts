import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIOrchestrator }        from '../../ai/orchestrator/AIOrchestrator';
import { AIConnectorRegistry }   from '../../ai/registry/AIConnectorRegistry';
import { InMemoryTelemetry }     from '../../ai/telemetry/AITelemetry';
import { AIConnectorError, ZERO_CAPABILITIES } from '../../ai/types/AITypes';
import type { IAIConnector }     from '../../ai/core/IAIConnector';
import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIConnectorCapabilities,
  ConnectorHealth,
  ConnectorConfigSchema,
  ConnectorType,
} from '../../ai/types/AITypes';
import type { OrchestratorConfig } from '../../ai/orchestrator/OrchestratorConfig';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NO_SLEEP = (_ms: number) => Promise.resolve();

function makeRequest(overrides?: Partial<AIRequest>): AIRequest {
  return {
    requestId:  'req-1',
    task:       'generic',
    userPrompt: 'hello',
    ...overrides,
  };
}

class MockConnector implements IAIConnector {
  readonly id:   string;
  readonly name: string;
  readonly type: ConnectorType = 'api_provider';

  callCount = 0;
  private _failTimes = 0;
  private _failsAttempted = 0;
  private _healthStatus: ConnectorHealth['status'] = 'connected';
  private _caps: AIConnectorCapabilities = { ...ZERO_CAPABILITIES, supportsJSON: true };

  constructor(id: string) {
    this.id   = id;
    this.name = `Mock-${id}`;
  }

  setFailTimes(n: number)                            { this._failTimes = n; }
  setHealthStatus(s: ConnectorHealth['status'])      { this._healthStatus = s; }
  setCapabilities(c: Partial<AIConnectorCapabilities>) { this._caps = { ...ZERO_CAPABILITIES, ...c }; }

  async connect():    Promise<void> {}
  async disconnect(): Promise<void> {}

  async health(): Promise<ConnectorHealth> {
    return { status: this._healthStatus, checkedAt: new Date().toISOString() };
  }

  capabilities(): AIConnectorCapabilities { return this._caps; }

  async execute(request: AIRequest): Promise<AIResponse> {
    this.callCount++;
    if (this._failsAttempted < this._failTimes) {
      this._failsAttempted++;
      throw new Error(`Simulated failure (attempt ${this._failsAttempted})`);
    }
    return {
      requestId:          request.requestId,
      text:               `Response from ${this.id}`,
      reasoningAvailable: false,
      latency:            5,
      provider:           this.id,
      connector:          this.id,
      model:              'mock-model',
    };
  }

  // eslint-disable-next-line require-yield
  async *stream(_r: AIRequest): AsyncGenerator<AIStreamChunk> {
    throw new Error('not supported');
  }

  async cancel(_requestId: string): Promise<void> {}

  configurationSchema(): ConnectorConfigSchema { return { fields: [] }; }
}

function fastConfig(overrides?: Partial<OrchestratorConfig>): OrchestratorConfig {
  return {
    retry: { maxAttempts: 3, initialDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0 },
    timeoutMs:          60_000,
    requireHealthCheck: false,
    fallbackEnabled:    true,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AIOrchestrator — connector selection', () => {
  let registry: AIConnectorRegistry;
  let orchestrator: AIOrchestrator;

  beforeEach(() => {
    registry    = new AIConnectorRegistry();
    orchestrator = new AIOrchestrator(registry, fastConfig(), NO_SLEEP);
  });

  it('throws NO_CONNECTORS when registry is empty', async () => {
    await expect(orchestrator.execute(makeRequest())).rejects.toMatchObject({
      code: 'NO_CONNECTORS',
    });
  });

  it('calls the single registered connector', async () => {
    const c = new MockConnector('only');
    registry.register(c);
    const resp = await orchestrator.execute(makeRequest());
    expect(resp.connector).toBe('only');
    expect(c.callCount).toBe(1);
  });

  it('selects highest-priority (lowest number) connector first', async () => {
    const high = new MockConnector('high');
    const low  = new MockConnector('low');
    registry.register(high, { priority: 10 });
    registry.register(low,  { priority: 200 });
    const resp = await orchestrator.execute(makeRequest());
    expect(resp.connector).toBe('high');
    expect(low.callCount).toBe(0);
  });

  it('skips disabled connectors', async () => {
    const disabled = new MockConnector('disabled');
    const active   = new MockConnector('active');
    registry.register(disabled, { priority: 1, enabled: false });
    registry.register(active,   { priority: 2 });
    const resp = await orchestrator.execute(makeRequest());
    expect(resp.connector).toBe('active');
    expect(disabled.callCount).toBe(0);
  });
});

describe('AIOrchestrator — retry', () => {
  let registry: AIConnectorRegistry;
  let orchestrator: AIOrchestrator;

  beforeEach(() => {
    registry    = new AIConnectorRegistry();
    orchestrator = new AIOrchestrator(registry, fastConfig(), NO_SLEEP);
  });

  it('retries the configured number of times on failure', async () => {
    const c = new MockConnector('flaky');
    c.setFailTimes(2);
    registry.register(c);
    const resp = await orchestrator.execute(makeRequest());
    expect(c.callCount).toBe(3);
    expect(resp.connector).toBe('flaky');
  });

  it('exhausts all retries and throws when connector keeps failing', async () => {
    const c = new MockConnector('always-fails');
    c.setFailTimes(999);
    registry.register(c);
    await expect(orchestrator.execute(makeRequest())).rejects.toThrow();
    expect(c.callCount).toBe(3);
  });

  it('succeeds on first attempt when connector does not fail', async () => {
    const c = new MockConnector('healthy');
    registry.register(c);
    await orchestrator.execute(makeRequest());
    expect(c.callCount).toBe(1);
  });

  it('respects maxAttempts = 1 (no retry)', async () => {
    const c = new MockConnector('fails-once');
    c.setFailTimes(1);
    registry.register(c);
    const cfg = fastConfig({ retry: { maxAttempts: 1, initialDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0 } });
    const orch = new AIOrchestrator(registry, cfg, NO_SLEEP);
    await expect(orch.execute(makeRequest())).rejects.toThrow();
    expect(c.callCount).toBe(1);
  });
});

describe('AIOrchestrator — fallback', () => {
  let registry: AIConnectorRegistry;

  beforeEach(() => { registry = new AIConnectorRegistry(); });

  it('falls back to second connector when first exhausts all retries', async () => {
    const bad  = new MockConnector('bad');
    const good = new MockConnector('good');
    bad.setFailTimes(999);
    registry.register(bad,  { priority: 1 });
    registry.register(good, { priority: 2 });

    const orch = new AIOrchestrator(registry, fastConfig(), NO_SLEEP);
    const resp = await orch.execute(makeRequest());
    expect(resp.connector).toBe('good');
  });

  it('throws ALL_FAILED when every connector fails', async () => {
    const a = new MockConnector('a');
    const b = new MockConnector('b');
    a.setFailTimes(999);
    b.setFailTimes(999);
    registry.register(a, { priority: 1 });
    registry.register(b, { priority: 2 });

    const orch = new AIOrchestrator(registry, fastConfig(), NO_SLEEP);
    await expect(orch.execute(makeRequest())).rejects.toThrow();
  });

  it('does not fall back when fallbackEnabled = false', async () => {
    const bad  = new MockConnector('bad');
    const good = new MockConnector('good');
    bad.setFailTimes(999);
    registry.register(bad,  { priority: 1 });
    registry.register(good, { priority: 2 });

    const orch = new AIOrchestrator(
      registry,
      fastConfig({ fallbackEnabled: false }),
      NO_SLEEP,
    );
    await expect(orch.execute(makeRequest())).rejects.toThrow();
    expect(good.callCount).toBe(0);
  });
});

describe('AIOrchestrator — capability filtering', () => {
  let registry: AIConnectorRegistry;
  let orchestrator: AIOrchestrator;

  beforeEach(() => {
    registry    = new AIConnectorRegistry();
    orchestrator = new AIOrchestrator(registry, fastConfig(), NO_SLEEP);
  });

  it('selects only connectors matching capability filter', async () => {
    const noVision   = new MockConnector('no-vision');
    const withVision = new MockConnector('vision');
    withVision.setCapabilities({ supportsVision: true });
    registry.register(noVision,   { priority: 1 });
    registry.register(withVision, { priority: 2 });

    const resp = await orchestrator.execute(makeRequest(), c => c.supportsVision);
    expect(resp.connector).toBe('vision');
    expect(noVision.callCount).toBe(0);
  });

  it('throws NO_CONNECTORS when filter matches nothing', async () => {
    registry.register(new MockConnector('a'));
    await expect(
      orchestrator.execute(makeRequest(), c => c.supportsReasoning),
    ).rejects.toMatchObject({ code: 'NO_CONNECTORS' });
  });
});

describe('AIOrchestrator — health check gating', () => {
  let registry: AIConnectorRegistry;

  beforeEach(() => { registry = new AIConnectorRegistry(); });

  it('skips connectors in error state when requireHealthCheck = true', async () => {
    const bad  = new MockConnector('bad');
    const good = new MockConnector('good');
    bad.setHealthStatus('error');
    registry.register(bad,  { priority: 1 });
    registry.register(good, { priority: 2 });

    const orch = new AIOrchestrator(
      registry,
      fastConfig({ requireHealthCheck: true }),
      NO_SLEEP,
    );
    const resp = await orch.execute(makeRequest());
    expect(resp.connector).toBe('good');
    expect(bad.callCount).toBe(0);
  });

  it('does not check health when requireHealthCheck = false', async () => {
    const spy = vi.fn().mockResolvedValue({ status: 'error', checkedAt: '' });
    const c   = new MockConnector('a');
    vi.spyOn(c, 'health').mockImplementation(spy);
    registry.register(c);

    const orch = new AIOrchestrator(
      registry,
      fastConfig({ requireHealthCheck: false }),
      NO_SLEEP,
    );
    await orch.execute(makeRequest());
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('AIOrchestrator — telemetry', () => {
  let registry:    AIConnectorRegistry;
  let telemetry:   InMemoryTelemetry;

  beforeEach(() => {
    registry  = new AIConnectorRegistry();
    telemetry = new InMemoryTelemetry();
  });

  function orchWithTelemetry() {
    return new AIOrchestrator(
      registry,
      fastConfig({ telemetryHooks: [{ onEvent: e => telemetry.record(e) }] }),
      NO_SLEEP,
    );
  }

  it('emits request_start on every call', async () => {
    registry.register(new MockConnector('a'));
    await orchWithTelemetry().execute(makeRequest());
    expect(telemetry.eventsOfType('request_start')).toHaveLength(1);
  });

  it('emits connector_selected when a connector is chosen', async () => {
    registry.register(new MockConnector('a'));
    await orchWithTelemetry().execute(makeRequest());
    const sel = telemetry.eventsOfType('connector_selected');
    expect(sel).toHaveLength(1);
    expect(sel[0].connectorId).toBe('a');
  });

  it('emits request_success on successful execution', async () => {
    registry.register(new MockConnector('a'));
    await orchWithTelemetry().execute(makeRequest());
    expect(telemetry.eventsOfType('request_success')).toHaveLength(1);
  });

  it('emits retry_attempt when connector fails and retries', async () => {
    const c = new MockConnector('flaky');
    c.setFailTimes(2);
    registry.register(c);
    await orchWithTelemetry().execute(makeRequest());
    expect(telemetry.eventsOfType('retry_attempt')).toHaveLength(2);
  });

  it('emits request_failure on each failed attempt', async () => {
    const c = new MockConnector('flaky');
    c.setFailTimes(2);
    registry.register(c);
    await orchWithTelemetry().execute(makeRequest());
    expect(telemetry.eventsOfType('request_failure')).toHaveLength(2);
  });

  it('emits fallback_triggered when falling back to next connector', async () => {
    const bad  = new MockConnector('bad');
    const good = new MockConnector('good');
    bad.setFailTimes(999);
    registry.register(bad,  { priority: 1 });
    registry.register(good, { priority: 2 });
    await orchWithTelemetry().execute(makeRequest());
    expect(telemetry.eventsOfType('fallback_triggered')).toHaveLength(1);
  });

  it('emits health_check event when requireHealthCheck = true', async () => {
    const c = new MockConnector('a');
    registry.register(c);
    const orch = new AIOrchestrator(
      registry,
      {
        ...fastConfig({ requireHealthCheck: true }),
        telemetryHooks: [{ onEvent: e => telemetry.record(e) }],
      },
      NO_SLEEP,
    );
    await orch.execute(makeRequest());
    expect(telemetry.eventsOfType('health_check')).toHaveLength(1);
  });
});

describe('AIOrchestrator — timeout', () => {
  it('throws TIMEOUT when connector exceeds timeoutMs', async () => {
    const registry = new AIConnectorRegistry();
    const slow = new MockConnector('slow');
    vi.spyOn(slow, 'execute').mockImplementation(async (_r: AIRequest): Promise<AIResponse> => {
      await new Promise(r => setTimeout(r, 500));
      return {
        requestId: _r.requestId, text: '', reasoningAvailable: false,
        latency: 500, provider: 'slow', connector: 'slow', model: 'mock',
      };
    });
    registry.register(slow);

    const orch = new AIOrchestrator(
      registry,
      {
        ...fastConfig(),
        timeoutMs: 10,
        retry: { maxAttempts: 1, initialDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0 },
      },
      NO_SLEEP,
    );

    await expect(orch.execute(makeRequest())).rejects.toMatchObject({ code: 'TIMEOUT' });
  }, 5000);
});

describe('AIOrchestrator — interface contracts', () => {
  it('AIConnectorError carries the right code and connectorId', () => {
    const err = new AIConnectorError('test', 'AUTH_FAILED', 'gemini');
    expect(err.code).toBe('AUTH_FAILED');
    expect(err.connectorId).toBe('gemini');
    expect(err.name).toBe('AIConnectorError');
    expect(err).toBeInstanceOf(Error);
  });

  it('orchestrator returns AIResponse with all required fields', async () => {
    const registry = new AIConnectorRegistry();
    registry.register(new MockConnector('a'));
    const orch = new AIOrchestrator(registry, fastConfig(), NO_SLEEP);
    const resp = await orch.execute(makeRequest({ requestId: 'test-req' }));

    expect(resp.requestId).toBe('test-req');
    expect(typeof resp.text).toBe('string');
    expect(typeof resp.latency).toBe('number');
    expect(typeof resp.provider).toBe('string');
    expect(typeof resp.connector).toBe('string');
    expect(typeof resp.model).toBe('string');
    expect(typeof resp.reasoningAvailable).toBe('boolean');
  });
});
