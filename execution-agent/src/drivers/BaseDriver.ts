// ─── BaseDriver ───────────────────────────────────────────────────────────────
// Abstract base with default lifecycle implementations.
// Concrete drivers extend this and override what they need.

import type { IDriver, ActionRequest, ActionResult } from './IDriver.js';
import type { DriverManifest } from './CapabilityManifest.js';

export abstract class BaseDriver implements IDriver {
  abstract readonly id: string;
  abstract readonly manifest: DriverManifest;

  protected _connected = false;

  /** One-time setup. Override to validate resources before connect(). */
  async initialize(): Promise<void> { /* no-op by default */ }

  abstract connect(config: Record<string, unknown>): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract execute(request: ActionRequest): Promise<ActionResult>;

  isConnected(): boolean {
    return this._connected;
  }

  /** Disconnect if connected, then release all resources. */
  async dispose(): Promise<void> {
    if (this._connected) {
      await this.disconnect();
    }
  }
}
