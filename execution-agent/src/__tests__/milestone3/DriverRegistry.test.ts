// ─── Milestone 3: DriverRegistry Tests ───────────────────────────────────────

import { DriverRegistry }             from '../../drivers/DriverRegistry.js';
import {
  DriverRegistrationException,
  DriverNotFoundException,
}                                      from '../../drivers/DriverExceptions.js';
import type { IDriver }               from '../../drivers/IDriver.js';
import type { ActionRequest,
              ActionResult }          from '../../drivers/IDriver.js';
import type { DriverManifest,
              Capability }            from '../../drivers/CapabilityManifest.js';

// ─── MockDriver factory ────────────────────────────────────────────────────────

function makeMockDriver(
  id: string,
  caps: Capability[] = ['tap'],
  overrides: Partial<DriverManifest> = {},
): IDriver {
  const manifest: DriverManifest = {
    driver_id:     id,
    driver_name:   `Mock ${id}`,
    version:       '1.0.0',
    capabilities:  new Set<Capability>(caps),
    config_schema: {},
    ...overrides,
  };
  return {
    id,
    manifest,
    connect:     async () => {},
    disconnect:  async () => {},
    isConnected: () => true,
    execute:     async (_req: ActionRequest): Promise<ActionResult> =>
      ({ success: true, duration_ms: 0 }),
  };
}

// ─── register ─────────────────────────────────────────────────────────────────

describe('DriverRegistry.register', () => {
  it('registers a driver without error', () => {
    const reg = new DriverRegistry();
    expect(() => reg.register(makeMockDriver('android_adb'))).not.toThrow();
  });

  it('allows multiple drivers with distinct IDs', () => {
    const reg = new DriverRegistry();
    reg.register(makeMockDriver('android_adb'));
    reg.register(makeMockDriver('chrome_cdp'));
    expect(reg.list()).toHaveLength(2);
  });

  it('throws DriverRegistrationException for a duplicate ID', () => {
    const reg = new DriverRegistry();
    reg.register(makeMockDriver('android_adb'));
    expect(() => reg.register(makeMockDriver('android_adb')))
      .toThrow(DriverRegistrationException);
  });

  it('DuplicateRegistrationException message mentions the driver ID', () => {
    const reg = new DriverRegistry();
    reg.register(makeMockDriver('android_adb'));
    try {
      reg.register(makeMockDriver('android_adb'));
    } catch (err) {
      expect(String(err)).toContain('android_adb');
    }
  });

  it('throws DriverRegistrationException when manifest.driver_id mismatches driver.id', () => {
    const driver = makeMockDriver('android_adb', ['tap'], { driver_id: 'wrong_id' });
    const reg = new DriverRegistry();
    expect(() => reg.register(driver)).toThrow(DriverRegistrationException);
  });

  it('throws DriverRegistrationException for empty driver_name in manifest', () => {
    const driver = makeMockDriver('android_adb', ['tap'], { driver_name: '' });
    const reg = new DriverRegistry();
    expect(() => reg.register(driver)).toThrow(DriverRegistrationException);
  });

  it('throws DriverRegistrationException for empty version in manifest', () => {
    const driver = makeMockDriver('android_adb', ['tap'], { version: '' });
    const reg = new DriverRegistry();
    expect(() => reg.register(driver)).toThrow(DriverRegistrationException);
  });

  it('throws DriverRegistrationException for empty capabilities in manifest', () => {
    const driver = makeMockDriver('android_adb', [] /* empty */);
    const reg = new DriverRegistry();
    expect(() => reg.register(driver)).toThrow(DriverRegistrationException);
  });
});

// ─── resolve ──────────────────────────────────────────────────────────────────

describe('DriverRegistry.resolve', () => {
  it('returns the registered driver', () => {
    const reg    = new DriverRegistry();
    const driver = makeMockDriver('android_adb');
    reg.register(driver);
    expect(reg.resolve('android_adb')).toBe(driver);
  });

  it('throws DriverNotFoundException for unregistered ID', () => {
    const reg = new DriverRegistry();
    expect(() => reg.resolve('ghost_driver')).toThrow(DriverNotFoundException);
  });

  it('DriverNotFoundException message includes the driver ID', () => {
    const reg = new DriverRegistry();
    try {
      reg.resolve('ghost_driver');
    } catch (err) {
      expect(String(err)).toContain('ghost_driver');
    }
  });
});

// ─── unregister ───────────────────────────────────────────────────────────────

describe('DriverRegistry.unregister', () => {
  it('removes a registered driver', () => {
    const reg = new DriverRegistry();
    reg.register(makeMockDriver('android_adb'));
    reg.unregister('android_adb');
    expect(reg.isRegistered('android_adb')).toBe(false);
  });

  it('is a no-op for an unregistered ID', () => {
    const reg = new DriverRegistry();
    expect(() => reg.unregister('nonexistent')).not.toThrow();
  });

  it('allows re-registration after unregister', () => {
    const reg = new DriverRegistry();
    reg.register(makeMockDriver('android_adb'));
    reg.unregister('android_adb');
    expect(() => reg.register(makeMockDriver('android_adb'))).not.toThrow();
  });
});

// ─── isRegistered / list ──────────────────────────────────────────────────────

describe('DriverRegistry.isRegistered / list', () => {
  it('isRegistered returns true for a registered driver', () => {
    const reg = new DriverRegistry();
    reg.register(makeMockDriver('android_adb'));
    expect(reg.isRegistered('android_adb')).toBe(true);
  });

  it('isRegistered returns false for an unregistered driver', () => {
    const reg = new DriverRegistry();
    expect(reg.isRegistered('ghost')).toBe(false);
  });

  it('list returns all registered drivers', () => {
    const reg = new DriverRegistry();
    reg.register(makeMockDriver('android_adb'));
    reg.register(makeMockDriver('chrome_cdp'));
    const ids = reg.list().map(d => d.id);
    expect(ids).toContain('android_adb');
    expect(ids).toContain('chrome_cdp');
    expect(ids).toHaveLength(2);
  });

  it('list returns empty array when no drivers registered', () => {
    const reg = new DriverRegistry();
    expect(reg.list()).toHaveLength(0);
  });
});

// ─── validateManifest ────────────────────────────────────────────────────────

describe('DriverRegistry.validateManifest', () => {
  const reg = new DriverRegistry();

  it('accepts a valid manifest', () => {
    const manifest: DriverManifest = {
      driver_id:     'test_driver',
      driver_name:   'Test Driver',
      version:       '1.0.0',
      capabilities:  new Set<Capability>(['tap', 'screenshot']),
      config_schema: {},
    };
    expect(() => reg.validateManifest(manifest)).not.toThrow();
  });

  it('rejects empty driver_id', () => {
    expect(() =>
      reg.validateManifest({
        driver_id: '', driver_name: 'Test', version: '1', capabilities: new Set(['tap' as Capability]), config_schema: {},
      }),
    ).toThrow(DriverRegistrationException);
  });

  it('rejects empty driver_name', () => {
    expect(() =>
      reg.validateManifest({
        driver_id: 'test', driver_name: '', version: '1', capabilities: new Set(['tap' as Capability]), config_schema: {},
      }),
    ).toThrow(DriverRegistrationException);
  });

  it('rejects empty version', () => {
    expect(() =>
      reg.validateManifest({
        driver_id: 'test', driver_name: 'Test', version: '', capabilities: new Set(['tap' as Capability]), config_schema: {},
      }),
    ).toThrow(DriverRegistrationException);
  });

  it('rejects empty capabilities set', () => {
    expect(() =>
      reg.validateManifest({
        driver_id: 'test', driver_name: 'Test', version: '1', capabilities: new Set<Capability>(), config_schema: {},
      }),
    ).toThrow(DriverRegistrationException);
  });
});
