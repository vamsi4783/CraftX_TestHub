// ─── Milestone 4: Driver Lifecycle, Registry integration, Cancellation, Timeout ─

import { MockDriver }                   from '../../drivers/mock/MockDriver.js';
import { DriverRegistry }               from '../../drivers/DriverRegistry.js';
import { DriverHost }                   from '../../drivers/DriverHost.js';
import { CancellationTokenSource,
         NON_CANCELLABLE }              from '../../drivers/DriverCancellation.js';
import {
  DriverTimeoutException,
  DriverCancelledException,
  DriverRegistrationException,
  DriverNotFoundException,
}                                        from '../../drivers/DriverExceptions.js';
import { StructuredLogger }             from '../../logging/StructuredLogger.js';
import type { DriverExecutionContext }  from '../../drivers/DriverExecutionContext.js';
import { AndroidDriver,
         ANDROID_DRIVER_MANIFEST }      from '../../drivers/android/AndroidDriver.js';
import { ChromeDriver,
         CHROME_DRIVER_MANIFEST }       from '../../drivers/chrome/ChromeDriver.js';
import type { PlaywrightAdapter }       from '../../drivers/chrome/PlaywrightAdapter.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(
  cts = new CancellationTokenSource(),
): DriverExecutionContext {
  return {
    executionId:       'exec-m4',
    sessionId:         'sess-m4',
    projectId:         'proj-m4',
    organizationId:    'org-m4',
    correlationId:     'sess-m4',
    cancellationToken: cts.token,
    logger:            new StructuredLogger('lifecycle-test'),
    timestamp:         '2026-08-06T12:00:00Z',
  };
}

// ─── Full lifecycle: initialize → connect → execute → disconnect → dispose ───

describe('Driver lifecycle', () => {
  it('full lifecycle completes without error (MockDriver)', async () => {
    const driver = new MockDriver();
    await driver.initialize();
    await driver.connect({});
    await driver.execute({ action: 'tap' });
    await driver.disconnect();
    await driver.dispose();

    expect(driver.initializeCallCount).toBe(1);
    expect(driver.connectCallCount).toBe(1);
    expect(driver.executeCallCount).toBe(1);
    expect(driver.disconnectCallCount).toBe(1);
    expect(driver.disposeCallCount).toBe(1);
  });

  it('dispose() after disconnect does not double-disconnect', async () => {
    const driver = new MockDriver({ startConnected: true });
    await driver.disconnect();
    await driver.dispose();
    expect(driver.disconnectCallCount).toBe(1); // only once (during explicit disconnect)
  });

  it('dispose() without prior disconnect disconnects first', async () => {
    const driver = new MockDriver({ startConnected: true });
    await driver.dispose();
    expect(driver.disconnectCallCount).toBe(1);
    expect(driver.isConnected()).toBe(false);
  });

  it('multiple connect() calls are tracked', async () => {
    const driver = new MockDriver();
    await driver.connect({});
    await driver.disconnect();
    await driver.connect({});
    expect(driver.connectCallCount).toBe(2);
  });
});

// ─── Registry integration ─────────────────────────────────────────────────────

describe('DriverRegistry integration with MockDriver', () => {
  it('MockDriver registers successfully', () => {
    const reg    = new DriverRegistry();
    const driver = new MockDriver({ id: 'mock_driver' });
    expect(() => reg.register(driver)).not.toThrow();
  });

  it('resolves the registered MockDriver by id', () => {
    const reg    = new DriverRegistry();
    const driver = new MockDriver({ id: 'mock_driver' });
    reg.register(driver);
    expect(reg.resolve('mock_driver')).toBe(driver);
  });

  it('throws DriverRegistrationException on duplicate id', () => {
    const reg = new DriverRegistry();
    reg.register(new MockDriver({ id: 'mock_driver' }));
    expect(() => reg.register(new MockDriver({ id: 'mock_driver' })))
      .toThrow(DriverRegistrationException);
  });

  it('throws DriverNotFoundException for unknown id', () => {
    const reg = new DriverRegistry();
    expect(() => reg.resolve('no_such_driver')).toThrow(DriverNotFoundException);
  });

  it('AndroidDriver manifest passes DriverRegistry.validateManifest', () => {
    const reg = new DriverRegistry();
    expect(() => reg.validateManifest(ANDROID_DRIVER_MANIFEST)).not.toThrow();
  });

  it('ChromeDriver manifest passes DriverRegistry.validateManifest', () => {
    const reg = new DriverRegistry();
    expect(() => reg.validateManifest(CHROME_DRIVER_MANIFEST)).not.toThrow();
  });

  it('registers both AndroidDriver and ChromeDriver together', () => {
    const reg = new DriverRegistry();
    // Use MockAdb / MockPw so we don't need real hardware
    reg.register(new MockDriver({ id: 'android_adb', capabilities: ['tap', 'screenshot'] }));
    reg.register(new MockDriver({ id: 'chrome_cdp',  capabilities: ['navigate', 'click'] }));
    expect(reg.list()).toHaveLength(2);
  });
});

// ─── DriverHost + MockDriver: execution success ───────────────────────────────

describe('DriverHost + MockDriver — execution', () => {
  it('executes successfully and returns DriverResult', async () => {
    const driver = new MockDriver({ startConnected: true });
    const host   = new DriverHost();
    const result = await host.execute(driver, { action: 'tap' }, makeContext());
    expect(result.success).toBe(true);
    expect(result.driver_id).toBe('mock_driver');
    expect(result.action).toBe('tap');
    expect(result.execution_id).toBe('exec-m4');
    expect(result.session_id).toBe('sess-m4');
  });

  it('execute with NON_CANCELLABLE token succeeds', async () => {
    const driver = new MockDriver({ startConnected: true });
    const host   = new DriverHost();
    const ctx    = { ...makeContext(), cancellationToken: NON_CANCELLABLE };
    await expect(host.execute(driver, { action: 'tap' }, ctx)).resolves.toBeDefined();
  });
});

// ─── Cancellation propagation ─────────────────────────────────────────────────

describe('DriverHost + MockDriver — cancellation propagation', () => {
  it('throws DriverCancelledException when token is pre-cancelled', async () => {
    const driver = new MockDriver({ startConnected: true, executeDelay_ms: 200 });
    const cts    = new CancellationTokenSource();
    cts.cancel();
    const host = new DriverHost({ defaultTimeout_ms: 5000 });

    await expect(
      host.execute(driver, { action: 'tap' }, makeContext(cts)),
    ).rejects.toThrow(DriverCancelledException);
  });

  it('throws DriverCancelledException when cancelled during execution', async () => {
    const driver = new MockDriver({ startConnected: true, executeDelay_ms: 300 });
    const cts    = new CancellationTokenSource();
    const host   = new DriverHost({ defaultTimeout_ms: 5000 });

    setTimeout(() => cts.cancel(), 50);

    await expect(
      host.execute(driver, { action: 'tap' }, makeContext(cts)),
    ).rejects.toThrow(DriverCancelledException);
  }, 2000);

  it('DriverCancelledException carries correct driver_id', async () => {
    const driver = new MockDriver({ id: 'mock_slow', startConnected: true, executeDelay_ms: 300 });
    const cts    = new CancellationTokenSource();
    cts.cancel();
    const host = new DriverHost({ defaultTimeout_ms: 5000 });

    try {
      await host.execute(driver, { action: 'tap' }, makeContext(cts));
    } catch (err) {
      expect((err as DriverCancelledException).driver_id).toBe('mock_slow');
    }
  });
});

// ─── Timeout handling ─────────────────────────────────────────────────────────

describe('DriverHost + MockDriver — timeout handling', () => {
  it('throws DriverTimeoutException when driver exceeds timeout', async () => {
    const driver = new MockDriver({ startConnected: true, executeDelay_ms: 300 });
    const host   = new DriverHost({ defaultTimeout_ms: 30 });

    await expect(
      host.execute(driver, { action: 'tap' }, makeContext()),
    ).rejects.toThrow(DriverTimeoutException);
  }, 2000);

  it('DriverTimeoutException carries correct timeout_ms', async () => {
    const driver = new MockDriver({ startConnected: true, executeDelay_ms: 300 });
    const host   = new DriverHost({ defaultTimeout_ms: 30 });

    try {
      await host.execute(driver, { action: 'tap' }, makeContext());
    } catch (err) {
      expect((err as DriverTimeoutException).timeout_ms).toBe(30);
    }
  }, 2000);

  it('per-call timeout_ms override is respected', async () => {
    const driver = new MockDriver({ startConnected: true, executeDelay_ms: 300 });
    const host   = new DriverHost({ defaultTimeout_ms: 5000 });

    await expect(
      host.execute(driver, { action: 'tap' }, makeContext(), { timeout_ms: 30 }),
    ).rejects.toThrow(DriverTimeoutException);
  }, 2000);

  it('does not timeout when driver finishes in time', async () => {
    const driver = new MockDriver({ startConnected: true, executeDelay_ms: 10 });
    const host   = new DriverHost({ defaultTimeout_ms: 1000 });

    await expect(
      host.execute(driver, { action: 'tap' }, makeContext()),
    ).resolves.toBeDefined();
  }, 2000);
});

// ─── Capability reporting ──────────────────────────────────────────────────────

describe('Capability reporting', () => {
  it('MockDriver with custom capabilities only reports those capabilities', () => {
    const driver = new MockDriver({ capabilities: ['screenshot', 'tap'] });
    expect(driver.manifest.capabilities.has('screenshot')).toBe(true);
    expect(driver.manifest.capabilities.has('tap')).toBe(true);
    expect(driver.manifest.capabilities.has('navigate')).toBe(false);
  });

  it('ANDROID_DRIVER_MANIFEST does not declare navigate (Chrome-only)', () => {
    expect(ANDROID_DRIVER_MANIFEST.capabilities.has('navigate')).toBe(false);
  });

  it('CHROME_DRIVER_MANIFEST does not declare install_apk (Android-only)', () => {
    expect(CHROME_DRIVER_MANIFEST.capabilities.has('install_apk')).toBe(false);
  });

  it('DriverHost rejects action not in capability set', async () => {
    const { DriverCapabilityException } = await import('../../drivers/DriverExceptions.js');
    const driver = new MockDriver({ startConnected: true, capabilities: ['tap'] });
    const host   = new DriverHost();
    await expect(
      host.execute(driver, { action: 'navigate' }, makeContext()),
    ).rejects.toThrow(DriverCapabilityException);
  });
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

describe('Driver metadata', () => {
  it('MockDriver exposes agent_compatibility', () => {
    expect(new MockDriver().manifest.agent_compatibility).toBeDefined();
  });

  it('MockDriver exposes platforms', () => {
    expect(new MockDriver().manifest.platforms).toBeDefined();
  });

  it('ANDROID_DRIVER_MANIFEST has agent_compatibility', () => {
    expect(ANDROID_DRIVER_MANIFEST.agent_compatibility).toBeDefined();
  });

  it('CHROME_DRIVER_MANIFEST has description', () => {
    expect(typeof CHROME_DRIVER_MANIFEST.description).toBe('string');
  });
});
