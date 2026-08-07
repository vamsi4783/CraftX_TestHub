// ─── ReconnectStrategy ────────────────────────────────────────────────────────
// Pure exponential-backoff reconnect decision function.
// No timer, no scheduler — callers decide when to act on the decision.

export interface ReconnectPolicy {
  /** Maximum number of reconnect attempts. 0 = never reconnect. */
  maxAttempts:       number;
  /** Delay before the first reconnect attempt (ms). */
  initialDelayMs:    number;
  /** Multiplier applied per subsequent attempt. */
  backoffMultiplier: number;
  /** Hard cap on delay (ms). */
  maxDelayMs:        number;
}

export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  maxAttempts:       10,
  initialDelayMs:    1_000,
  backoffMultiplier: 2,
  maxDelayMs:        30_000,
};

export interface ReconnectDecision {
  shouldReconnect: boolean;
  /** How long to wait before reconnecting (0 when shouldReconnect is false). */
  delayMs:         number;
  attemptNumber:   number;
}

/**
 * Pure function — given a policy and 1-based attempt number, return whether
 * to reconnect and how long to wait.
 */
export function evaluateReconnect(
  policy:        ReconnectPolicy,
  attemptNumber: number,
): ReconnectDecision {
  const shouldReconnect = attemptNumber <= policy.maxAttempts;
  const delayMs = shouldReconnect
    ? Math.min(
        policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attemptNumber - 1),
        policy.maxDelayMs,
      )
    : 0;
  return { shouldReconnect, delayMs, attemptNumber };
}
