// ─── Milestone 4: MockDriver Tests ───────────────────────────────────────────

import { MockDriver }      from '../../drivers/mock/MockDriver.js';
import { BaseDriver }      from '../../drivers/BaseDriver.js';

// ─── Manifest ─────────────────────────────────────────────────────────────────

describe('MockDriver — manifest', () => {
  it('uses default id "mock_driver"', () => {
    const d = new MockDriver();
    expect(d.id).toBe('mock_driver');
  });

  it('accepts a custom id', () => {
    const d = new MockDriver({ id: 'my_mock' });
    expect(d.id).toBe('my_mock');
    expect(d.manifest.driver_id).toBe('my_mock');
  });

  it('driver.id matches manifest.driver_id', () => {
    const d = new MockDriver({ id: 'x_driver' });
    expect(d.id).toBe(d.manifest.driver_id);
  });

  it('default capabilities include tap', () => {
    expect(new MockDriver().manifest.capabilities.has('tap')).toBe(true);
  });

  it('default capabilities include navigate', () => {
    expect(new MockDriver().manifest.capabilities.has('navigate')).toBe(true);
  });

  it('accepts custom capabilities', () => {
    const d = new MockDriver({ capabilities: ['screenshot'] });
    expect(d.manifest.capabilities.has('screenshot')).toBe(true);
    expect(d.manifest.capabilities.has('tap')).toBe(false);
  });

  it('manifest.platforms is ["all"]', () => {
    expect(new MockDriver().manifest.platforms).toEqual(['all']);
  });
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('MockDriver — lifecycle', () => {
  it('is an instance of BaseDriver', () => {
    expect(new MockDriver()).toBeInstanceOf(BaseDriver);
  });

  it('isConnected() is false by default', () => {
    expect(new MockDriver().isConnected()).toBe(false);
  });

  it('isConnected() is true when startConnected: true', () => {
    expect(new MockDriver({ startConnected: true }).isConnected()).toBe(true);
  });

  it('connect() sets isConnected to true', async () => {
    const d = new MockDriver();
    await d.connect({});
    expect(d.isConnected()).toBe(true);
  });

  it('disconnect() sets isConnected to false', async () => {
    const d = new MockDriver({ startConnected: true });
    await d.disconnect();
    expect(d.isConnected()).toBe(false);
  });

  it('initialize() increments initializeCallCount', async () => {
    const d = new MockDriver();
    await d.initialize();
    expect(d.initializeCallCount).toBe(1);
  });

  it('connect() increments connectCallCount', async () => {
    const d = new MockDriver();
    await d.connect({});
    expect(d.connectCallCount).toBe(1);
  });

  it('disconnect() increments disconnectCallCount', async () => {
    const d = new MockDriver({ startConnected: true });
    await d.disconnect();
    expect(d.disconnectCallCount).toBe(1);
  });

  it('dispose() increments disposeCallCount', async () => {
    const d = new MockDriver();
    await d.dispose();
    expect(d.disposeCallCount).toBe(1);
  });

  it('dispose() calls disconnect if connected', async () => {
    const d = new MockDriver({ startConnected: true });
    await d.dispose();
    expect(d.disconnectCallCount).toBe(1);
    expect(d.isConnected()).toBe(false);
  });

  it('dispose() does NOT call disconnect if already disconnected', async () => {
    const d = new MockDriver();
    await d.dispose();
    expect(d.disconnectCallCount).toBe(0);
  });

  it('stores lastConnectConfig', async () => {
    const d      = new MockDriver();
    const config = { serial: 'emulator-5554' };
    await d.connect(config);
    expect(d.lastConnectConfig).toEqual(config);
  });
});

// ─── Execute ──────────────────────────────────────────────────────────────────

describe('MockDriver — execute (deterministic)', () => {
  it('returns success: true by default', async () => {
    const d      = new MockDriver({ startConnected: true });
    const result = await d.execute({ action: 'tap' });
    expect(result.success).toBe(true);
  });

  it('returns the configured executeResult', async () => {
    const d = new MockDriver({
      startConnected: true,
      executeResult:  { success: false, duration_ms: 0, error: 'blocked' },
    });
    const result = await d.execute({ action: 'tap' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('blocked');
  });

  it('throws when executeResult is an Error', async () => {
    const boom = new Error('driver boom');
    const d    = new MockDriver({ startConnected: true, executeResult: boom });
    await expect(d.execute({ action: 'tap' })).rejects.toThrow('driver boom');
  });

  it('increments executeCallCount on each call', async () => {
    const d = new MockDriver({ startConnected: true });
    await d.execute({ action: 'tap' });
    await d.execute({ action: 'click' });
    expect(d.executeCallCount).toBe(2);
  });

  it('records lastRequest', async () => {
    const d   = new MockDriver({ startConnected: true });
    const req = { action: 'navigate', value: 'https://example.com' };
    await d.execute(req);
    expect(d.lastRequest).toEqual(req);
  });

  it('accumulates executeHistory', async () => {
    const d = new MockDriver({ startConnected: true });
    await d.execute({ action: 'tap' });
    await d.execute({ action: 'screenshot' });
    expect(d.executeHistory).toHaveLength(2);
    expect(d.executeHistory[0].action).toBe('tap');
    expect(d.executeHistory[1].action).toBe('screenshot');
  });

  it('respects executeDelay_ms', async () => {
    const d   = new MockDriver({ startConnected: true, executeDelay_ms: 50 });
    const t0  = Date.now();
    await d.execute({ action: 'tap' });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(45);
  }, 2000);
});

// ─── reset() ──────────────────────────────────────────────────────────────────

describe('MockDriver — reset()', () => {
  it('clears all counters and history', async () => {
    const d = new MockDriver({ startConnected: true });
    await d.initialize();
    await d.execute({ action: 'tap' });
    d.reset();

    expect(d.initializeCallCount).toBe(0);
    expect(d.executeCallCount).toBe(0);
    expect(d.executeHistory).toHaveLength(0);
    expect(d.lastRequest).toBeNull();
  });
});
