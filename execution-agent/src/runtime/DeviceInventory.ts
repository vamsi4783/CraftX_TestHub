// ─── DeviceInventory ──────────────────────────────────────────────────────────
// Tracks connected devices, browsers, simulators, emulators, and driver
// availability. Thread-safe under Node.js single-threaded model.

export type DeviceKind = 'android' | 'browser' | 'simulator' | 'emulator';
export type DeviceAvailability = 'available' | 'busy' | 'error' | 'disconnected';

export interface RegisteredDevice {
  readonly deviceId:    string;   // ADB serial, "chrome:9222", simulator UDID, etc.
  readonly kind:        DeviceKind;
  readonly driverId:    string;
  readonly deviceModel: string;
  readonly osVersion:   string;
  availability:         DeviceAvailability;
  readonly registeredAt: string;  // ISO8601Z
  lastSeenAt:           string;   // ISO8601Z — updated on heartbeat
}

export interface DriverAvailability {
  readonly driverId: string;
  readonly driverVersion: string;
  deviceCount: number;
  availableCount: number;
}

export class DeviceNotFoundError extends Error {
  constructor(deviceId: string) {
    super(`Device "${deviceId}" is not registered in DeviceInventory.`);
    this.name = 'DeviceNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DeviceInventory {
  private readonly _devices = new Map<string, RegisteredDevice>();
  private readonly _drivers = new Map<string, DriverAvailability>();

  // ─── Devices ────────────────────────────────────────────────────────────────

  register(device: Omit<RegisteredDevice, 'registeredAt' | 'lastSeenAt'>): void {
    const now = new Date().toISOString();
    const entry: RegisteredDevice = {
      ...device,
      registeredAt: now,
      lastSeenAt:   now,
    };
    this._devices.set(device.deviceId, entry);
    this._incrementDriverCount(device.driverId, device.availability);
  }

  unregister(deviceId: string): void {
    const device = this._devices.get(deviceId);
    if (!device) return;
    this._decrementDriverCount(device.driverId, device.availability);
    this._devices.delete(deviceId);
  }

  setAvailability(deviceId: string, availability: DeviceAvailability): void {
    const device = this._devices.get(deviceId);
    if (!device) throw new DeviceNotFoundError(deviceId);
    const prev = device.availability;
    device.availability = availability;
    device.lastSeenAt   = new Date().toISOString();
    this._updateDriverCounts(device.driverId, prev, availability);
  }

  heartbeat(deviceId: string): void {
    const device = this._devices.get(deviceId);
    if (!device) throw new DeviceNotFoundError(deviceId);
    device.lastSeenAt = new Date().toISOString();
  }

  get(deviceId: string): RegisteredDevice | undefined {
    return this._devices.get(deviceId);
  }

  all(): RegisteredDevice[] {
    return Array.from(this._devices.values());
  }

  byKind(kind: DeviceKind): RegisteredDevice[] {
    return this.all().filter(d => d.kind === kind);
  }

  available(): RegisteredDevice[] {
    return this.all().filter(d => d.availability === 'available');
  }

  count(): number { return this._devices.size; }

  // ─── Driver availability ─────────────────────────────────────────────────────

  registerDriver(driverId: string, driverVersion: string): void {
    if (!this._drivers.has(driverId)) {
      this._drivers.set(driverId, { driverId, driverVersion, deviceCount: 0, availableCount: 0 });
    }
  }

  driverAvailability(driverId: string): DriverAvailability | undefined {
    return this._drivers.get(driverId);
  }

  allDrivers(): DriverAvailability[] {
    return Array.from(this._drivers.values());
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _incrementDriverCount(driverId: string, availability: DeviceAvailability): void {
    const d = this._drivers.get(driverId);
    if (!d) return;
    d.deviceCount++;
    if (availability === 'available') d.availableCount++;
  }

  private _decrementDriverCount(driverId: string, availability: DeviceAvailability): void {
    const d = this._drivers.get(driverId);
    if (!d) return;
    d.deviceCount    = Math.max(0, d.deviceCount - 1);
    if (availability === 'available') d.availableCount = Math.max(0, d.availableCount - 1);
  }

  private _updateDriverCounts(
    driverId: string,
    prev: DeviceAvailability,
    next: DeviceAvailability,
  ): void {
    const d = this._drivers.get(driverId);
    if (!d) return;
    if (prev === 'available' && next !== 'available') d.availableCount = Math.max(0, d.availableCount - 1);
    if (prev !== 'available' && next === 'available') d.availableCount++;
  }
}
