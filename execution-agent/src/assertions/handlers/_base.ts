// ─── Assertion handler helpers ────────────────────────────────────────────────
// Shared utilities for building AssertionResult objects.

import type { AssertionKind, AssertionParams, AssertionResult, AssertionStatus } from '../AssertionTypes.js';

export function makeResult(
  kind:       AssertionKind,
  status:     AssertionStatus,
  expected:   string,
  actual:     string,
  message:    string,
  duration_ms: number,
  extras:     Partial<AssertionResult> = {},
): AssertionResult {
  return { assertionKind: kind, status, expected, actual, message, duration_ms, ...extras };
}

export function applyNegate(result: AssertionResult, negate?: boolean): AssertionResult {
  if (!negate) return result;
  const flipped: AssertionResult = {
    ...result,
    negated: true,
    status:  result.status === 'PASS' ? 'FAIL'
           : result.status === 'FAIL' ? 'PASS'
           : result.status,
    message: `[negated] ${result.message}`,
  };
  return flipped;
}

export function expected(params: AssertionParams): string {
  return params.expected ?? params.value ?? '';
}
