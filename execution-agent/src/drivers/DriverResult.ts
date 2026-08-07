// ─── Driver Result ────────────────────────────────────────────────────────────
// Returned by DriverHost.execute() on SUCCESS.
// Timeout and cancellation outcomes throw exceptions — they never produce a result.

export interface DriverResult {
  /** True when the action succeeded (driver returned success:true). */
  success: boolean;
  /** Wall-clock duration measured by DriverHost — NOT by the driver itself. */
  duration_ms: number;
  /** Screenshot buffer — present when action === 'screenshot' or auto-captured. */
  screenshot?: Buffer;
  /** Human-readable error message from the driver (when success: false). */
  error?: string;
  /** Driver-specific raw output. For debugging only. Never forwarded to the UI. */
  raw?: unknown;
  /** The driver that produced this result. */
  driver_id: string;
  /** The action that was executed. */
  action: string;
  /** Execution ID from the DriverExecutionContext. */
  execution_id: string;
  /** Session ID from the DriverExecutionContext. */
  session_id: string;
}
