// ─── Milestone 7: AgentRuntime Tests ─────────────────────────────────────────

import { AgentRuntime }          from '../../runtime/AgentRuntime.js';
import { buildRuntimeConfig }    from '../../runtime/RuntimeConfiguration.js';
import { NOOP_RUNTIME_METRICS }  from '../../runtime/RuntimeMetrics.js';
import type { AgentRuntimeDeps } from '../../runtime/AgentRuntime.js';
import type { SystemMetricsProvider } from '../../runtime/HealthMonitor.js';
import type { HeartbeatTimer }   from '../../runtime/HeartbeatService.js';
import type { RuntimeMetricsHooks } from '../../runtime/RuntimeMetrics.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMetrics(): SystemMetricsProvider {
  return { cpuPercent: () => 20, memoryUsedMb: () => 200, memoryTotalMb: () => 8192 };
}

/** Timer that never fires automatically — lets tests drive ticks manually. */
function makeManualTimer(): { timer: HeartbeatTimer; ticks: Array<() => void> } {
  const ticks: Array<() => void> = [];
  const timer: HeartbeatTimer = {
    schedule(fn) {
      ticks.push(fn);
      return () => { /* no-op cancel */ };
    },
  };
  return { timer, ticks };
}

function makeRuntime(overrides: Partial<AgentRuntimeDeps> = {}, configOverrides = {}) {
  const emittedPayloads: unknown[] = [];
  const config = buildRuntimeConfig({
    agentId:             'agent-test',
    agentVersion:        '1.0.0',
    heartbeatIntervalMs: 5000,
    healthEnabled:       true,
    metricsEnabled:      true,
    ...configOverrides,
  });
  const deps: AgentRuntimeDeps = {
    systemMetrics:  makeMetrics(),
    heartbeatEmit:  (p) => { emittedPayloads.push(p); },
    heartbeatTimer: makeManualTimer().timer,
    metrics:        NOOP_RUNTIME_METRICS,
    ...overrides,
  };
  const rt = new AgentRuntime(config, deps);
  return { rt, emittedPayloads };
}

// ─── Startup ──────────────────────────────────────────────────────────────────

describe('AgentRuntime — startup', () => {
  it('starts in Created state', () => {
    const { rt } = makeRuntime();
    expect(rt.status().state).toBe('Created');
  });

  it('transitions to Running after start()', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    expect(rt.status().state).toBe('Running');
  });

  it('startedAt is set after start()', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    expect(rt.status().startedAt).not.toBeNull();
  });

  it('stoppedAt is null while running', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    expect(rt.status().stoppedAt).toBeNull();
  });

  it('uptimeMs is non-negative while running', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    expect(rt.status().uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it('fires runtime_started metric', async () => {
    const calls: string[] = [];
    const metrics: RuntimeMetricsHooks = {
      ...NOOP_RUNTIME_METRICS,
      runtime_started: () => { calls.push('runtime_started'); },
    };
    const config = buildRuntimeConfig({ agentId: 'a', heartbeatIntervalMs: 5000 });
    const rt = new AgentRuntime(config, {
      systemMetrics:  makeMetrics(),
      heartbeatEmit:  () => undefined,
      heartbeatTimer: makeManualTimer().timer,
      metrics,
    });
    await rt.start();
    expect(calls).toContain('runtime_started');
  });

  it('collects an initial health report on start', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    expect(rt.lastHealth()).not.toBeNull();
  });
});

// ─── Shutdown ─────────────────────────────────────────────────────────────────

describe('AgentRuntime — shutdown', () => {
  it('transitions to Stopped after stop()', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    await rt.stop();
    expect(rt.status().state).toBe('Stopped');
  });

  it('stoppedAt is set after stop()', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    await rt.stop();
    expect(rt.status().stoppedAt).not.toBeNull();
  });

  it('uptimeMs is 0 after stop', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    await rt.stop();
    expect(rt.status().uptimeMs).toBe(0);
  });

  it('fires runtime_stopped metric', async () => {
    const calls: string[] = [];
    const metrics: RuntimeMetricsHooks = {
      ...NOOP_RUNTIME_METRICS,
      runtime_stopped: () => { calls.push('runtime_stopped'); },
    };
    const config = buildRuntimeConfig({ agentId: 'a', heartbeatIntervalMs: 5000 });
    const rt = new AgentRuntime(config, {
      systemMetrics:  makeMetrics(),
      heartbeatEmit:  () => undefined,
      heartbeatTimer: makeManualTimer().timer,
      metrics,
    });
    await rt.start();
    await rt.stop();
    expect(calls).toContain('runtime_stopped');
  });

  it('stop() is idempotent on terminal state', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    await rt.stop();
    await expect(rt.stop()).resolves.not.toThrow();
    expect(rt.status().state).toBe('Stopped');
  });
});

// ─── Fault ────────────────────────────────────────────────────────────────────

describe('AgentRuntime — fault', () => {
  it('fault() transitions to Faulted', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    rt.fault('disk full');
    expect(rt.status().state).toBe('Faulted');
  });

  it('faultReason is set after fault()', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    rt.fault('disk full');
    expect(rt.status().faultReason).toBe('disk full');
  });

  it('fault() is no-op on terminal state', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    await rt.stop();
    expect(() => rt.fault('anything')).not.toThrow();
    expect(rt.status().state).toBe('Stopped');
  });
});

// ─── Heartbeat scheduling ─────────────────────────────────────────────────────

describe('AgentRuntime — heartbeat scheduling', () => {
  it('heartbeat fires after manual tick', async () => {
    const emitted: unknown[] = [];
    const { timer } = makeManualTimer();

    // Capture the registered function
    let tickFn: (() => void) | null = null;
    const capturingTimer: HeartbeatTimer = {
      schedule(fn) {
        tickFn = fn;
        return () => undefined;
      },
    };

    const config = buildRuntimeConfig({ agentId: 'a', heartbeatIntervalMs: 5000 });
    const rt = new AgentRuntime(config, {
      systemMetrics:  makeMetrics(),
      heartbeatEmit:  (p) => { emitted.push(p); },
      heartbeatTimer: capturingTimer,
      metrics:        NOOP_RUNTIME_METRICS,
    });
    await rt.start();

    expect(tickFn).not.toBeNull();
    tickFn!(); // simulate interval firing
    await new Promise(r => setTimeout(r, 10));
    expect(emitted.length).toBe(1);
    void timer;
  });

  it('manual tick() emits a payload with agent_id', async () => {
    const emitted: unknown[] = [];
    const config = buildRuntimeConfig({ agentId: 'my-agent', heartbeatIntervalMs: 5000 });
    const rt = new AgentRuntime(config, {
      systemMetrics:  makeMetrics(),
      heartbeatEmit:  (p) => { emitted.push(p); },
      heartbeatTimer: makeManualTimer().timer,
      metrics:        NOOP_RUNTIME_METRICS,
    });
    await rt.start();
    await rt.heartbeatService.tick();
    expect(emitted.length).toBe(1);
    const payload = emitted[0] as Record<string, unknown>;
    expect(payload['agent_id']).toBe('my-agent');
  });

  it('heartbeat sequenceNumber increments on each tick', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    await rt.heartbeatService.tick();
    await rt.heartbeatService.tick();
    expect(rt.heartbeatService.sequenceNumber).toBe(2);
  });

  it('heartbeat_sent metric fires on each tick', async () => {
    const calls: number[] = [];
    const metrics: RuntimeMetricsHooks = {
      ...NOOP_RUNTIME_METRICS,
      heartbeat_sent: (_id, seq) => { calls.push(seq); },
    };
    const config = buildRuntimeConfig({ agentId: 'a', heartbeatIntervalMs: 5000 });
    const rt = new AgentRuntime(config, {
      systemMetrics:  makeMetrics(),
      heartbeatEmit:  () => undefined,
      heartbeatTimer: makeManualTimer().timer,
      metrics,
    });
    await rt.start();
    await rt.heartbeatService.tick();
    await rt.heartbeatService.tick();
    expect(calls).toEqual([1, 2]);
  });

  it('heartbeat_failed fires when emitter throws', async () => {
    const calls: string[] = [];
    const metrics: RuntimeMetricsHooks = {
      ...NOOP_RUNTIME_METRICS,
      heartbeat_failed: () => { calls.push('heartbeat_failed'); },
    };
    const config = buildRuntimeConfig({ agentId: 'a', heartbeatIntervalMs: 5000 });
    const rt = new AgentRuntime(config, {
      systemMetrics:  makeMetrics(),
      heartbeatEmit:  () => { throw new Error('emit failed'); },
      heartbeatTimer: makeManualTimer().timer,
      metrics,
    });
    await rt.start();
    await rt.heartbeatService.tick();
    expect(calls).toContain('heartbeat_failed');
  });
});

// ─── Health collection ────────────────────────────────────────────────────────

describe('AgentRuntime — health collection', () => {
  it('collectHealth returns a HealthReport', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    const r = rt.collectHealth(2, 5);
    expect(r.activeExecutions).toBe(2);
    expect(r.queueDepth).toBe(5);
  });

  it('lastHealth() is updated after collectHealth()', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    const r = rt.collectHealth(1, 0);
    expect(rt.lastHealth()).toBe(r);
  });
});

// ─── Diagnostics snapshot ─────────────────────────────────────────────────────

describe('AgentRuntime — diagnostics snapshot', () => {
  it('snapshot() returns snapshotAt', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    const snap = rt.snapshot();
    expect(typeof snap.snapshotAt).toBe('string');
  });

  it('snapshot() contains current state', async () => {
    const { rt } = makeRuntime();
    await rt.start();
    expect(rt.snapshot().state).toBe('Running');
  });

  it('verbose snapshot includes devices array', async () => {
    const { rt } = makeRuntime({}, { diagnosticsLevel: 'verbose' });
    await rt.start();
    const snap = rt.snapshot() as { devices?: unknown[] };
    expect(Array.isArray(snap.devices)).toBe(true);
  });

  it('basic snapshot does not include devices array', async () => {
    const { rt } = makeRuntime({}, { diagnosticsLevel: 'basic' });
    await rt.start();
    const snap = rt.snapshot() as { devices?: unknown[] };
    expect(snap.devices).toBeUndefined();
  });
});

// ─── Device inventory access ──────────────────────────────────────────────────

describe('AgentRuntime — device inventory', () => {
  it('deviceInventory is accessible', () => {
    const { rt } = makeRuntime();
    expect(rt.deviceInventory).toBeDefined();
  });

  it('devices registered through deviceInventory appear in health', async () => {
    const { rt } = makeRuntime();
    rt.deviceInventory.register({
      deviceId: 'px-001', kind: 'android', driverId: 'android_adb',
      deviceModel: 'Pixel 7a', osVersion: '14', availability: 'available',
    });
    await rt.start();
    const report = rt.collectHealth(0, 0);
    expect(report.connectedDevices).toBe(1);
  });
});

// ─── RuntimeConfiguration ─────────────────────────────────────────────────────

describe('RuntimeConfiguration', () => {
  it('buildRuntimeConfig merges overrides onto defaults', () => {
    const cfg = buildRuntimeConfig({ agentId: 'custom-id', heartbeatIntervalMs: 10000 });
    expect(cfg.agentId).toBe('custom-id');
    expect(cfg.heartbeatIntervalMs).toBe(10000);
    expect(cfg.logLevel).toBe('info');  // default preserved
  });

  it('default heartbeatIntervalMs is 5000', () => {
    const cfg = buildRuntimeConfig({});
    expect(cfg.heartbeatIntervalMs).toBe(5000);
  });

  it('metricsEnabled defaults to true', () => {
    expect(buildRuntimeConfig({}).metricsEnabled).toBe(true);
  });

  it('healthEnabled defaults to true', () => {
    expect(buildRuntimeConfig({}).healthEnabled).toBe(true);
  });
});
