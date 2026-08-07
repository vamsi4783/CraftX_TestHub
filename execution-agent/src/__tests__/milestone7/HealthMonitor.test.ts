// ─── Milestone 7: HealthMonitor Tests ────────────────────────────────────────

import { HealthMonitor }       from '../../runtime/HealthMonitor.js';
import { DeviceInventory }     from '../../runtime/DeviceInventory.js';
import { NOOP_RUNTIME_METRICS } from '../../runtime/RuntimeMetrics.js';
import type { SystemMetricsProvider } from '../../runtime/HealthMonitor.js';
import type { RuntimeMetricsHooks }   from '../../runtime/RuntimeMetrics.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMetrics(cpu = 10, memUsed = 100, memTotal = 8192): SystemMetricsProvider {
  return {
    cpuPercent:    () => cpu,
    memoryUsedMb:  () => memUsed,
    memoryTotalMb: () => memTotal,
  };
}

function makeMonitor(cpu = 10, memUsed = 100, memTotal = 8192) {
  const inv = new DeviceInventory();
  const mon = new HealthMonitor(makeMetrics(cpu, memUsed, memTotal), inv, NOOP_RUNTIME_METRICS, 'agent-test');
  return { mon, inv };
}

// ─── Report structure ─────────────────────────────────────────────────────────

describe('HealthMonitor.collect — report structure', () => {
  it('returns a report with reportedAt', () => {
    const { mon } = makeMonitor();
    const r = mon.collect({ activeExecutions: 0, queueDepth: 0 });
    expect(typeof r.reportedAt).toBe('string');
    expect(r.reportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('cpuPercent comes from provider', () => {
    const { mon } = makeMonitor(55);
    const r = mon.collect({ activeExecutions: 0, queueDepth: 0 });
    expect(r.cpuPercent).toBe(55);
  });

  it('memoryUsedMb comes from provider', () => {
    const { mon } = makeMonitor(10, 512);
    const r = mon.collect({ activeExecutions: 0, queueDepth: 0 });
    expect(r.memoryUsedMb).toBe(512);
  });

  it('memoryTotalMb comes from provider', () => {
    const { mon } = makeMonitor(10, 512, 4096);
    const r = mon.collect({ activeExecutions: 0, queueDepth: 0 });
    expect(r.memoryTotalMb).toBe(4096);
  });

  it('activeExecutions comes from ctx', () => {
    const { mon } = makeMonitor();
    const r = mon.collect({ activeExecutions: 3, queueDepth: 7 });
    expect(r.activeExecutions).toBe(3);
    expect(r.queueDepth).toBe(7);
  });

  it('uptimeMs is non-negative', () => {
    const { mon } = makeMonitor();
    const r = mon.collect({ activeExecutions: 0, queueDepth: 0 });
    expect(r.uptimeMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── Status computation ───────────────────────────────────────────────────────

describe('HealthMonitor — health status', () => {
  it('healthy when cpu <= 70 and executions <= 10', () => {
    const { mon } = makeMonitor(50);
    expect(mon.collect({ activeExecutions: 2, queueDepth: 0 }).status).toBe('healthy');
  });

  it('degraded when cpu > 70', () => {
    const { mon } = makeMonitor(75);
    expect(mon.collect({ activeExecutions: 0, queueDepth: 0 }).status).toBe('degraded');
  });

  it('degraded when activeExecutions > 10', () => {
    const { mon } = makeMonitor(10);
    expect(mon.collect({ activeExecutions: 11, queueDepth: 0 }).status).toBe('degraded');
  });

  it('unhealthy when cpu > 90', () => {
    const { mon } = makeMonitor(95);
    expect(mon.collect({ activeExecutions: 0, queueDepth: 0 }).status).toBe('unhealthy');
  });

  it('unhealthy when memory > 90% of total', () => {
    const { mon } = makeMonitor(10, 9500, 10000);
    expect(mon.collect({ activeExecutions: 0, queueDepth: 0 }).status).toBe('unhealthy');
  });
});

// ─── Connected devices / drivers ──────────────────────────────────────────────

describe('HealthMonitor — connected device/driver counts', () => {
  it('connectedDrivers matches inventory.allDrivers().length', () => {
    const inv = new DeviceInventory();
    inv.registerDriver('android_adb', '1.0.0');
    inv.registerDriver('chrome_cdp', '1.0.0');
    const mon = new HealthMonitor(makeMetrics(), inv);
    const r = mon.collect({ activeExecutions: 0, queueDepth: 0 });
    expect(r.connectedDrivers).toBe(2);
  });

  it('connectedDevices counts only available devices', () => {
    const inv = new DeviceInventory();
    inv.register({ deviceId: 'a', kind: 'android', driverId: 'android_adb', deviceModel: 'P7', osVersion: '14', availability: 'available' });
    inv.register({ deviceId: 'b', kind: 'android', driverId: 'android_adb', deviceModel: 'P7', osVersion: '14', availability: 'busy' });
    const mon = new HealthMonitor(makeMetrics(), inv);
    expect(mon.collect({ activeExecutions: 0, queueDepth: 0 }).connectedDevices).toBe(1);
  });
});

// ─── lastReport ───────────────────────────────────────────────────────────────

describe('HealthMonitor.lastReport', () => {
  it('returns null before first collect', () => {
    const { mon } = makeMonitor();
    expect(mon.lastReport()).toBeNull();
  });

  it('returns the most recent report after collect', () => {
    const { mon } = makeMonitor();
    const r = mon.collect({ activeExecutions: 0, queueDepth: 0 });
    expect(mon.lastReport()).toBe(r);
  });

  it('updates after each collect', () => {
    const { mon } = makeMonitor();
    const r1 = mon.collect({ activeExecutions: 0, queueDepth: 0 });
    const r2 = mon.collect({ activeExecutions: 1, queueDepth: 0 });
    expect(mon.lastReport()).toBe(r2);
    expect(mon.lastReport()).not.toBe(r1);
  });
});

// ─── Metrics hooks ────────────────────────────────────────────────────────────

describe('HealthMonitor — metrics hooks', () => {
  it('fires health_checked on collect', () => {
    const calls: string[] = [];
    const metrics: RuntimeMetricsHooks = {
      ...NOOP_RUNTIME_METRICS,
      health_checked: () => { calls.push('health_checked'); },
    };
    const inv = new DeviceInventory();
    const mon = new HealthMonitor(makeMetrics(), inv, metrics, 'agent-x');
    mon.collect({ activeExecutions: 0, queueDepth: 0 });
    expect(calls).toContain('health_checked');
  });
});

// ─── Graceful degradation ─────────────────────────────────────────────────────

describe('HealthMonitor — graceful degradation', () => {
  it('does not throw when metric provider throws', () => {
    const inv = new DeviceInventory();
    const bad: SystemMetricsProvider = {
      cpuPercent:    () => { throw new Error('cpu unavailable'); },
      memoryUsedMb:  () => 0,
      memoryTotalMb: () => 0,
    };
    const mon = new HealthMonitor(bad, inv);
    expect(() => mon.collect({ activeExecutions: 0, queueDepth: 0 })).not.toThrow();
  });

  it('sets detail when metric provider throws', () => {
    const inv = new DeviceInventory();
    const bad: SystemMetricsProvider = {
      cpuPercent:    () => { throw new Error('cpu unavailable'); },
      memoryUsedMb:  () => 0,
      memoryTotalMb: () => 0,
    };
    const mon = new HealthMonitor(bad, inv);
    const r = mon.collect({ activeExecutions: 0, queueDepth: 0 });
    expect(r.detail).not.toBeNull();
    expect(r.detail!).toContain('cpu unavailable');
  });
});
