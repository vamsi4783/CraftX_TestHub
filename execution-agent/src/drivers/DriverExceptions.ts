// ─── Driver Exception Hierarchy ───────────────────────────────────────────────
// DriverException is the root. All runtime execution failures extend it.
// DriverRegistrationException and DriverNotFoundException are configuration-time
// errors (not execution failures) and stand alone.

import type { Capability } from './CapabilityManifest.js';

// ─── Root ─────────────────────────────────────────────────────────────────────

export class DriverException extends Error {
  constructor(message: string, public readonly driver_id: string) {
    super(message);
    this.name = 'DriverException';
    // Restore prototype chain for instanceof checks across module boundaries
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Execution failures ───────────────────────────────────────────────────────

export class DriverTimeoutException extends DriverException {
  constructor(
    driver_id: string,
    public readonly timeout_ms: number,
    public readonly action: string,
  ) {
    super(
      `Driver "${driver_id}" timed out after ${timeout_ms}ms executing "${action}"`,
      driver_id,
    );
    this.name = 'DriverTimeoutException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DriverCancelledException extends DriverException {
  constructor(driver_id: string, public readonly action: string) {
    super(
      `Driver "${driver_id}" execution was cancelled while executing "${action}"`,
      driver_id,
    );
    this.name = 'DriverCancelledException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DriverCapabilityException extends DriverException {
  constructor(
    driver_id: string,
    public readonly action: string,
    public readonly available: Set<Capability>,
  ) {
    super(
      `Driver "${driver_id}" does not support action "${action}". ` +
      `Available capabilities: ${[...available].join(', ')}`,
      driver_id,
    );
    this.name = 'DriverCapabilityException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DriverExecutionException extends DriverException {
  constructor(
    driver_id: string,
    public readonly action: string,
    public readonly cause: unknown,
  ) {
    super(
      `Driver "${driver_id}" threw an exception while executing "${action}": ${String(cause)}`,
      driver_id,
    );
    this.name = 'DriverExecutionException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DriverNotConnectedException extends DriverException {
  constructor(driver_id: string) {
    super(
      `Driver "${driver_id}" is not connected. Call driver.connect() before executing.`,
      driver_id,
    );
    this.name = 'DriverNotConnectedException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Configuration-time errors (not execution failures) ───────────────────────

export class DriverRegistrationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriverRegistrationException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DriverNotFoundException extends Error {
  constructor(driver_id: string) {
    super(`No driver registered with id: "${driver_id}".`);
    this.name = 'DriverNotFoundException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
