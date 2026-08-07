// ─── ExecutionContext ─────────────────────────────────────────────────────────
// Higher-level context carried through the entire execution lifecycle.
// Distinct from DriverExecutionContext, which is scoped to a single driver call.

import type { CancellationToken } from '../drivers/DriverCancellation.js';
import type { StructuredLogger }   from '../logging/StructuredLogger.js';
import type { MetricsHooks }       from './ExecutionMetrics.js';

export interface ExecutionContext {
  /** UUID v7 generated at the start of ExecutionEngine.execute(). */
  readonly executionId: string;
  /** CQRS correlation_id — groups all events for one session. */
  readonly sessionId: string;
  readonly projectId: string;
  readonly organizationId: string;
  /** e.g. "execution-agent/android" */
  readonly agentId: string;
  /** === sessionId — kept separate for clarity. */
  readonly correlationId: string;
  /** 1-based index of the step currently being executed. Mutated by ExecutionEngine. */
  currentStep: number;
  readonly totalSteps: number;
  readonly cancellationToken: CancellationToken;
  readonly logger: StructuredLogger;
  readonly metrics: MetricsHooks;
}
