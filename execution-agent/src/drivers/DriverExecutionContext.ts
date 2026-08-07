// ─── Driver Execution Context ─────────────────────────────────────────────────
// Created by DriverHost once per execute() call.
// Passed to middleware hooks; not passed to IDriver.execute() directly
// (drivers must not implement timeout, cancellation, or logging themselves).

import type { CancellationToken } from './DriverCancellation.js';
import type { StructuredLogger } from '../logging/StructuredLogger.js';

export interface DriverExecutionContext {
  /** UUID of this specific execution attempt. */
  readonly executionId: string;
  /** Parent session/run identifier. */
  readonly sessionId: string;
  /** TestHub project this execution belongs to. */
  readonly projectId: string;
  /** Supabase org that owns the project. */
  readonly organizationId: string;
  /** CQRS correlation_id — links all events for this session. */
  readonly correlationId: string;
  /** Cancellation signal for this execution. */
  readonly cancellationToken: CancellationToken;
  /** Per-execution structured logger. */
  readonly logger: StructuredLogger;
  /** ISO8601Z timestamp when DriverHost.execute() was called. */
  readonly timestamp: string;
}
