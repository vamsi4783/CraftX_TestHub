// ─── Evidence Upload Retry — Contracts ───────────────────────────────────────
// Retry scheduling contracts only. No timer or scheduler in Phase 3.
// Phase 7: EvidenceManager will use a BackgroundScheduler to fire retries.

// ─── Reason ───────────────────────────────────────────────────────────────────

export type RetryReason =
  | 'network_error'
  | 'storage_unavailable'
  | 'size_limit_exceeded'
  | 'auth_failure'
  | 'timeout'
  | 'unknown';

// ─── Policy ───────────────────────────────────────────────────────────────────

export interface RetryPolicy {
  /** Maximum number of upload attempts total (first attempt + retries). */
  maxAttempts:        number;
  /** Delay before the first retry, in milliseconds. */
  initialDelayMs:     number;
  /** Multiplier applied to the delay on each subsequent attempt. */
  backoffMultiplier:  number;
  /** Hard cap on delay, in milliseconds. */
  maxDelayMs:         number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts:       3,
  initialDelayMs:    1_000,
  backoffMultiplier: 2,
  maxDelayMs:        30_000,
};

// ─── Result ───────────────────────────────────────────────────────────────────

export interface RetryResult {
  /** Whether another attempt should be made. */
  shouldRetry:    boolean;
  /** How long to wait before the next attempt (0 when shouldRetry is false). */
  delayMs:        number;
  reason:         RetryReason;
  /** 1-based attempt number that just failed. */
  attemptNumber:  number;
}

// ─── Evaluator (pure — no side effects, no timers) ───────────────────────────

/**
 * Determine whether to retry and how long to wait.
 * This is a pure function — callers decide whether to act on the result.
 *
 * @param policy         Retry configuration.
 * @param attemptNumber  1-based count of the attempt that just failed.
 * @param reason         Why the attempt failed.
 */
export function evaluateRetry(
  policy:        RetryPolicy,
  attemptNumber: number,
  reason:        RetryReason,
): RetryResult {
  const shouldRetry = attemptNumber < policy.maxAttempts;
  const delayMs = shouldRetry
    ? Math.min(
        policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attemptNumber - 1),
        policy.maxDelayMs,
      )
    : 0;
  return { shouldRetry, delayMs, reason, attemptNumber };
}

/** Classify an error thrown by the artifact store into a RetryReason. */
export function classifyError(err: unknown): RetryReason {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused'))
    return 'network_error';
  if (msg.includes('unavailable') || msg.includes('503'))
    return 'storage_unavailable';
  if (msg.includes('too large') || msg.includes('413') || msg.includes('size'))
    return 'size_limit_exceeded';
  if (msg.includes('auth') || msg.includes('401') || msg.includes('403'))
    return 'auth_failure';
  if (msg.includes('timeout') || msg.includes('timed out'))
    return 'timeout';
  return 'unknown';
}
