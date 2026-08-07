// ─── Driver Registry ──────────────────────────────────────────────────────────
// Single source of truth for registered IDriver instances.
// Validates manifest completeness and ID consistency on registration.
// Prevents duplicate driver IDs — each driver ID must be globally unique.

import type { IDriver } from './IDriver.js';
import type { DriverManifest } from './CapabilityManifest.js';
import {
  DriverRegistrationException,
  DriverNotFoundException,
} from './DriverExceptions.js';

export class DriverRegistry {
  private readonly drivers = new Map<string, IDriver>();

  /**
   * Register a driver.
   * Validates manifest correctness before accepting the driver.
   * Throws DriverRegistrationException on duplicate ID or invalid manifest.
   */
  register(driver: IDriver): void {
    if (this.drivers.has(driver.id)) {
      throw new DriverRegistrationException(
        `Driver already registered: "${driver.id}". Each driver ID must be unique.`,
      );
    }
    this._validateManifest(driver);
    this.drivers.set(driver.id, driver);
  }

  /**
   * Resolve a driver by ID.
   * Throws DriverNotFoundException if no driver is registered with the given ID.
   */
  resolve(driver_id: string): IDriver {
    const driver = this.drivers.get(driver_id);
    if (!driver) throw new DriverNotFoundException(driver_id);
    return driver;
  }

  /** Remove a driver by ID. No-op if not registered. */
  unregister(driver_id: string): void {
    this.drivers.delete(driver_id);
  }

  /** True if a driver with the given ID is registered. */
  isRegistered(driver_id: string): boolean {
    return this.drivers.has(driver_id);
  }

  /** All currently registered drivers. */
  list(): IDriver[] {
    return Array.from(this.drivers.values());
  }

  /**
   * Validate a DriverManifest in isolation (without a driver instance).
   * Used by tests and CLI tooling to verify manifests before registration.
   * Throws DriverRegistrationException if any field is invalid.
   */
  validateManifest(manifest: DriverManifest): void {
    if (!manifest.driver_id || manifest.driver_id.trim() === '') {
      throw new DriverRegistrationException('Manifest driver_id must be non-empty.');
    }
    if (!manifest.driver_name || manifest.driver_name.trim() === '') {
      throw new DriverRegistrationException(
        `Manifest driver_name must be non-empty (driver_id: "${manifest.driver_id}").`,
      );
    }
    if (!manifest.version || manifest.version.trim() === '') {
      throw new DriverRegistrationException(
        `Manifest version must be non-empty (driver_id: "${manifest.driver_id}").`,
      );
    }
    if (!manifest.capabilities || manifest.capabilities.size === 0) {
      throw new DriverRegistrationException(
        `Manifest capabilities must be non-empty (driver_id: "${manifest.driver_id}"). ` +
        `A driver with no capabilities cannot execute any action.`,
      );
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _validateManifest(driver: IDriver): void {
    const m = driver.manifest;

    // driver.id must match manifest.driver_id — catching copy-paste errors early
    if (m.driver_id !== driver.id) {
      throw new DriverRegistrationException(
        `Manifest ID mismatch: driver.id="${driver.id}" ` +
        `but manifest.driver_id="${m.driver_id}". They must be identical.`,
      );
    }

    this.validateManifest(m);
  }
}
