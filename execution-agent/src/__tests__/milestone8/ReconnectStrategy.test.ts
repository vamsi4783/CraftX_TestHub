// ─── Milestone 8: ReconnectStrategy Tests ────────────────────────────────────

import {
  evaluateReconnect,
  DEFAULT_RECONNECT_POLICY,
}                         from '../../communication/ReconnectStrategy.js';
import type { ReconnectPolicy } from '../../communication/ReconnectStrategy.js';

const policy3: ReconnectPolicy = {
  maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000,
};

const policy1: ReconnectPolicy = {
  maxAttempts: 1, initialDelayMs: 500, backoffMultiplier: 2, maxDelayMs: 10000,
};

// ─── shouldReconnect ──────────────────────────────────────────────────────────

describe('evaluateReconnect — shouldReconnect', () => {
  it('true for attempt 1 when maxAttempts=3', () => {
    expect(evaluateReconnect(policy3, 1).shouldReconnect).toBe(true);
  });

  it('true for attempt 3 when maxAttempts=3', () => {
    expect(evaluateReconnect(policy3, 3).shouldReconnect).toBe(true);
  });

  it('false for attempt 4 when maxAttempts=3', () => {
    expect(evaluateReconnect(policy3, 4).shouldReconnect).toBe(false);
  });

  it('false for attempt 1 when maxAttempts=0', () => {
    const noRetry: ReconnectPolicy = { maxAttempts: 0, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 };
    expect(evaluateReconnect(noRetry, 1).shouldReconnect).toBe(false);
  });
});

// ─── delayMs ──────────────────────────────────────────────────────────────────

describe('evaluateReconnect — delayMs', () => {
  it('attempt 1 → initialDelayMs', () => {
    expect(evaluateReconnect(policy3, 1).delayMs).toBe(1000);
  });

  it('attempt 2 → initialDelayMs * backoffMultiplier', () => {
    expect(evaluateReconnect(policy3, 2).delayMs).toBe(2000);
  });

  it('attempt 3 → initialDelayMs * backoffMultiplier^2', () => {
    expect(evaluateReconnect(policy3, 3).delayMs).toBe(4000);
  });

  it('delayMs is capped at maxDelayMs', () => {
    const capPolicy: ReconnectPolicy = {
      maxAttempts: 10, initialDelayMs: 1000, backoffMultiplier: 10, maxDelayMs: 5000,
    };
    const result = evaluateReconnect(capPolicy, 5);
    expect(result.delayMs).toBeLessThanOrEqual(5000);
  });

  it('delayMs is 0 when shouldReconnect is false', () => {
    expect(evaluateReconnect(policy1, 2).delayMs).toBe(0);
  });
});

// ─── attemptNumber ────────────────────────────────────────────────────────────

describe('evaluateReconnect — attemptNumber', () => {
  it('preserves attemptNumber in result', () => {
    expect(evaluateReconnect(policy3, 2).attemptNumber).toBe(2);
  });
});

// ─── DEFAULT_RECONNECT_POLICY ─────────────────────────────────────────────────

describe('DEFAULT_RECONNECT_POLICY', () => {
  it('maxAttempts is 10', () => {
    expect(DEFAULT_RECONNECT_POLICY.maxAttempts).toBe(10);
  });

  it('initialDelayMs is 1000', () => {
    expect(DEFAULT_RECONNECT_POLICY.initialDelayMs).toBe(1_000);
  });

  it('backoffMultiplier is 2', () => {
    expect(DEFAULT_RECONNECT_POLICY.backoffMultiplier).toBe(2);
  });

  it('maxDelayMs is 30000', () => {
    expect(DEFAULT_RECONNECT_POLICY.maxDelayMs).toBe(30_000);
  });
});
