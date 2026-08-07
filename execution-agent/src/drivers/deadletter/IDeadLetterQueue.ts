// ─── Dead-Letter Queue Contract ───────────────────────────────────────────────
// Interface only — implementation deferred.
// When a driver execution fails after all retries, the DriverHost (or caller)
// may push the failed item here for later inspection, manual retry, or alerting.

import type { ActionRequest } from '../IDriver.js';
import type { DriverException } from '../DriverExceptions.js';

/**
 * A snapshot of the execution context stored in a dead-letter item.
 * Excludes live objects (CancellationToken, StructuredLogger) that cannot be serialized.
 */
export interface DeadLetterContext {
  executionId:    string;
  sessionId:      string;
  projectId:      string;
  organizationId: string;
  correlationId:  string;
  timestamp:      string;
}

/** One entry in the dead-letter queue. */
export interface DeadLetterItem {
  /** The driver that failed. */
  driver_id:   string;
  /** The action that was being executed when failure occurred. */
  request:     ActionRequest;
  /** Execution context snapshot (serializable fields only). */
  context:     DeadLetterContext;
  /** The exception that caused the failure. */
  error:       DriverException;
  /** ISO8601Z timestamp of when the item was added to the queue. */
  failed_at:   string;
  /** Number of previous attempts before this failure. */
  retry_count: number;
}

/**
 * Dead-letter queue for driver execution failures.
 * Push items here after exhausting all retry strategies.
 * Implementation deferred — Phase 5 will provide a Supabase-backed implementation.
 */
export interface IDeadLetterQueue {
  /** Push a failed execution item onto the queue. */
  push(item: DeadLetterItem): Promise<void>;

  /**
   * Peek at the oldest N items without removing them.
   * Default limit is implementation-defined.
   */
  peek(limit?: number): Promise<DeadLetterItem[]>;

  /** Total items currently in the queue. */
  size(): Promise<number>;
}
