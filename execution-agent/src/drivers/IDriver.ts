// ─── IDriver Interface ───────────────────────────────────────────────────────
// Single-dispatch interface implemented by every driver.
// DriverHost wraps every call — drivers never handle timeout or cancellation.

import type { DriverManifest } from './CapabilityManifest.js';

export interface ActionRequest {
  /** Must match a Capability declared in the driver's manifest. */
  action: string;
  /** resource-id, xpath, css, text — driver-interpreted. */
  selector?: string;
  /** Text to type, key to press, URL to navigate, etc. */
  value?: string;
  params?: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  /** Measured by DriverHost, not the driver itself. */
  duration_ms: number;
  /** Populated when action === 'screenshot' or driver auto-captures on failure. */
  screenshot?: Buffer;
  error?: string;
  /** Driver-specific raw output for debugging. Never sent to UI. */
  raw?: unknown;
}

export interface IDriver {
  readonly id: string;
  readonly manifest: DriverManifest;
  connect(config: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  /** Core single-dispatch method. DriverHost calls this — never call directly. */
  execute(request: ActionRequest): Promise<ActionResult>;
  isConnected(): boolean;
}
