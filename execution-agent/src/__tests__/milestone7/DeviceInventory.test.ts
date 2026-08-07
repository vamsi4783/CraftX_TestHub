// ─── Milestone 7: DeviceInventory Tests ──────────────────────────────────────

import {
  DeviceInventory,
  DeviceNotFoundError,
} from '../../runtime/DeviceInventory.js';
import type { RegisteredDevice } from '../../runtime/DeviceInventory.js';

function makeDeviceSpec(overrides: Partial<Omit<RegisteredDevice, 'registeredAt' | 'lastSeenAt'>> = {})
  : Omit<RegisteredDevice, 'registeredAt' | 'lastSeenAt'>
{
  return {
    deviceId:     'serial-001',
    kind:         'android',
    driverId:     'android_adb',
    deviceModel:  'Pixel 7a',
    osVersion:    '14',
    availability: 'available',
    ...overrides,
  };
}

// ─── register / unregister ────────────────────────────────────────────────────

describe('DeviceInventory.register', () => {
  it('count() increases after register', () => {
    const inv = new DeviceInventory();
    inv.register(makeDeviceSpec());
    expect(inv.count()).toBe(1);
  });

  it('get() returns the registered device', () => {
    const inv = new DeviceInventory();
    inv.register(makeDeviceSpec({ deviceId: 'dev-001' }));
    expect(inv.get('dev-001')).toBeDefined();
    expect(inv.get('dev-001')!.kind).toBe('android');
  });

  it('registeredAt and lastSeenAt are set', () => {
    const inv  = new DeviceInventory();
    const before = new Date().toISOString();
    inv.register(makeDeviceSpec());
    const after = new Date().toISOString();
    const dev = inv.get('serial-001')!;
    expect(dev.registeredAt >= before).toBe(true);
    expect(dev.registeredAt <= after).toBe(true);
    expect(dev.lastSeenAt >= before).toBe(true);
  });

  it('get() returns undefined for unknown deviceId', () => {
    expect(new DeviceInventory().get('ghost')).toBeUndefined();
  });

  it('re-registering same deviceId overwrites the entry', () => {
    const inv = new DeviceInventory();
    inv.register(makeDeviceSpec({ osVersion: '13' }));
    inv.register(makeDeviceSpec({ osVersion: '14' }));
    expect(inv.get('serial-001')!.osVersion).toBe('14');
  });
});

describe('DeviceInventory.unregister', () => {
  it('removes the device', () => {
    const inv = new DeviceInventory();
    inv.register(makeDeviceSpec());
    inv.unregister('serial-001');
    expect(inv.get('serial-001')).toBeUndefined();
    expect(inv.count()).toBe(0);
  });

  it('no-op for unknown deviceId', () => {
    expect(() => new DeviceInventory().unregister('ghost')).not.toThrow();
  });
});

// ─── availability ─────────────────────────────────────────────────────────────

describe('DeviceInventory.setAvailability', () => {
  it('updates device availability', () => {
    const inv = new DeviceInventory();
    inv.register(makeDeviceSpec({ availability: 'available' }));
    inv.setAvailability('serial-001', 'busy');
    expect(inv.get('serial-001')!.availability).toBe('busy');
  });

  it('updates lastSeenAt', async () => {
    const inv = new DeviceInventory();
    inv.register(makeDeviceSpec());
    const before = inv.get('serial-001')!.lastSeenAt;
    await new Promise(r => setTimeout(r, 2));
    inv.setAvailability('serial-001', 'busy');
    const after = inv.get('serial-001')!.lastSeenAt;
    expect(after >= before).toBe(true);
  });

  it('throws DeviceNotFoundError for unknown deviceId', () => {
    const inv = new DeviceInventory();
    expect(() => inv.setAvailability('ghost', 'busy')).toThrow(DeviceNotFoundError);
  });
});

describe('DeviceInventory.heartbeat', () => {
  it('updates lastSeenAt', async () => {
    const inv = new DeviceInventory();
    inv.register(makeDeviceSpec());
    const before = inv.get('serial-001')!.lastSeenAt;
    await new Promise(r => setTimeout(r, 2));
    inv.heartbeat('serial-001');
    expect(inv.get('serial-001')!.lastSeenAt > before).toBe(true);
  });

  it('throws DeviceNotFoundError for unknown deviceId', () => {
    expect(() => new DeviceInventory().heartbeat('ghost')).toThrow(DeviceNotFoundError);
  });
});

// ─── queries ──────────────────────────────────────────────────────────────────

describe('DeviceInventory — queries', () => {
  it('all() returns all devices', () => {
    const inv = new DeviceInventory();
    inv.register(makeDeviceSpec({ deviceId: 'a' }));
    inv.register(makeDeviceSpec({ deviceId: 'b' }));
    expect(inv.all()).toHaveLength(2);
  });

  it('byKind() filters correctly', () => {
    const inv = new DeviceInventory();
    inv.register(makeDeviceSpec({ deviceId: 'a', kind: 'android' }));
    inv.register(makeDeviceSpec({ deviceId: 'b', kind: 'browser' }));
    expect(inv.byKind('android')).toHaveLength(1);
    expect(inv.byKind('browser')).toHaveLength(1);
    expect(inv.byKind('simulator')).toHaveLength(0);
  });

  it('available() returns only available devices', () => {
    const inv = new DeviceInventory();
    inv.register(makeDeviceSpec({ deviceId: 'a', availability: 'available' }));
    inv.register(makeDeviceSpec({ deviceId: 'b', availability: 'busy' }));
    const avail = inv.available();
    expect(avail).toHaveLength(1);
    expect(avail[0].deviceId).toBe('a');
  });
});

// ─── driver availability ──────────────────────────────────────────────────────

describe('DeviceInventory — driver availability', () => {
  it('registerDriver creates an entry', () => {
    const inv = new DeviceInventory();
    inv.registerDriver('android_adb', '1.0.0');
    const da = inv.driverAvailability('android_adb');
    expect(da).toBeDefined();
    expect(da!.driverId).toBe('android_adb');
    expect(da!.deviceCount).toBe(0);
  });

  it('device registration increments driver deviceCount', () => {
    const inv = new DeviceInventory();
    inv.registerDriver('android_adb', '1.0.0');
    inv.register(makeDeviceSpec({ driverId: 'android_adb', availability: 'available' }));
    const da = inv.driverAvailability('android_adb')!;
    expect(da.deviceCount).toBe(1);
    expect(da.availableCount).toBe(1);
  });

  it('setting device to busy decrements availableCount', () => {
    const inv = new DeviceInventory();
    inv.registerDriver('android_adb', '1.0.0');
    inv.register(makeDeviceSpec({ driverId: 'android_adb', availability: 'available' }));
    inv.setAvailability('serial-001', 'busy');
    const da = inv.driverAvailability('android_adb')!;
    expect(da.availableCount).toBe(0);
    expect(da.deviceCount).toBe(1);
  });

  it('unregister decrements driver counts', () => {
    const inv = new DeviceInventory();
    inv.registerDriver('android_adb', '1.0.0');
    inv.register(makeDeviceSpec({ driverId: 'android_adb', availability: 'available' }));
    inv.unregister('serial-001');
    const da = inv.driverAvailability('android_adb')!;
    expect(da.deviceCount).toBe(0);
    expect(da.availableCount).toBe(0);
  });

  it('allDrivers() returns all registered drivers', () => {
    const inv = new DeviceInventory();
    inv.registerDriver('android_adb', '1.0.0');
    inv.registerDriver('chrome_cdp', '1.0.0');
    expect(inv.allDrivers()).toHaveLength(2);
  });

  it('registerDriver is idempotent', () => {
    const inv = new DeviceInventory();
    inv.registerDriver('android_adb', '1.0.0');
    inv.registerDriver('android_adb', '1.0.0'); // no-op
    expect(inv.allDrivers()).toHaveLength(1);
  });
});
