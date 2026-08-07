// ─── FailureClassifier tests (Phase 4 M8) ─────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { FailureClassifier } from '../../services/failureAnalysis/FailureClassifier';
import type { ExecutionSummary, Evidence } from '../../services/failureAnalysis/FailureAnalysisTypes';

function makeSummary(overrides: Partial<ExecutionSummary> = {}): ExecutionSummary {
  return {
    runId:           'run-1',
    status:          'failed',
    totalSteps:      5,
    passedSteps:     3,
    failedSteps:     2,
    skippedSteps:    0,
    duration_ms:     4000,
    startedAt:       '2026-08-07T10:00:00Z',
    steps:           [],
    failedStepList:  [],
    assertions:      [],
    healingAttempts: [],
    ...overrides,
  };
}

function makeStep(error: string, stepNumber = 1) {
  return {
    stepId: 'step-1', stepNumber, action: 'tap', status: 'failed' as const,
    duration_ms: 100, error,
  };
}

const classifier = new FailureClassifier();
const NO_EVIDENCE: Evidence[] = [];

describe('FailureClassifier', () => {
  // ── Assertion failure ──────────────────────────────────────────────────────
  it('classifies assertion_failure when assertions FAIL', () => {
    const summary = makeSummary({
      assertions: [{
        id: 'a1', stepNumber: 2, assertionKind: 'equals', status: 'FAIL',
        expected: 'Welcome', actual: 'Error', message: 'Text mismatch',
      }],
    });
    const result = classifier.classify(summary, NO_EVIDENCE);
    expect(result.category).toBe('assertion_failure');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('classifies assertion_failure when assertions ERROR', () => {
    const summary = makeSummary({
      assertions: [{
        id: 'a2', stepNumber: 1, assertionKind: 'exists', status: 'ERROR',
        expected: 'true', actual: 'undefined', message: 'Element not accessible',
      }],
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('assertion_failure');
  });

  // ── Locator failure ────────────────────────────────────────────────────────
  it('classifies locator_failure for "no such element"', () => {
    const summary = makeSummary({
      failedStepList: [makeStep('no such element: com.example:id/btn_login')],
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('locator_failure');
  });

  it('classifies locator_failure for "unable to locate"', () => {
    const summary = makeSummary({
      failedStepList: [makeStep('unable to locate element: //android.widget.Button')],
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('locator_failure');
  });

  it('classifies locator_failure for "element not found"', () => {
    const summary = makeSummary({
      failedStepList: [makeStep('Element not found after 10 retries')],
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('locator_failure');
  });

  // ── Timeout ────────────────────────────────────────────────────────────────
  it('classifies timeout for "timed out"', () => {
    const summary = makeSummary({
      failedStepList: [makeStep('Step timed out after 30000ms')],
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('timeout');
  });

  it('classifies timeout for "implicit wait" error', () => {
    const summary = makeSummary({
      failedStepList: [makeStep('Implicit wait expired: element not ready')],
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('timeout');
  });

  // ── Crash ──────────────────────────────────────────────────────────────────
  it('classifies crash for ANR', () => {
    const summary = makeSummary({
      error: 'ANR detected: application not responding for 5000ms',
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('crash');
    expect(classifier.classify(summary, NO_EVIDENCE).confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies crash for fatal exception', () => {
    const summary = makeSummary({
      error: 'FATAL EXCEPTION: main java.lang.NullPointerException',
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('crash');
  });

  // ── Navigation ─────────────────────────────────────────────────────────────
  it('classifies navigation failure', () => {
    const summary = makeSummary({
      failedStepList: [makeStep('Wrong activity: expected LoginActivity but got SplashActivity')],
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('navigation');
  });

  // ── Permission ─────────────────────────────────────────────────────────────
  it('classifies permission denied', () => {
    const summary = makeSummary({
      failedStepList: [makeStep('SecurityException: Permission denied to access camera')],
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('permission');
  });

  // ── Visual regression ──────────────────────────────────────────────────────
  it('classifies visual_regression when visual diff evidence exists', () => {
    const summary = makeSummary();
    const evidence: Evidence[] = [{
      id: 'v1', type: 'visual_diff', stepNumber: 3,
      metadata: { hasDiff: true, diffPercent: 5.2 },
    }];
    expect(classifier.classify(summary, evidence).category).toBe('visual_regression');
  });

  // ── API failure ────────────────────────────────────────────────────────────
  it('classifies api_failure for HTTP error', () => {
    const summary = makeSummary({
      failedStepList: [makeStep('HTTP error 503: Service Unavailable')],
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('api_failure');
  });

  it('classifies api_failure for network connection refused', () => {
    const summary = makeSummary({
      failedStepList: [makeStep('Connection refused: api.example.com:443')],
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('api_failure');
  });

  // ── Unknown ────────────────────────────────────────────────────────────────
  it('classifies unknown when no pattern matches', () => {
    const summary = makeSummary({
      failedStepList: [makeStep('Something totally unexpected happened here')],
    });
    const result = classifier.classify(summary, NO_EVIDENCE);
    expect(result.category).toBe('unknown');
    expect(result.confidence).toBeLessThan(0.6);
  });

  // ── Multiple signals ────────────────────────────────────────────────────────
  it('collects all matching signals (highest confidence wins)', () => {
    const summary = makeSummary({
      error:          'ANR detected',
      failedStepList: [makeStep('no such element: btn_crash')],
    });
    const result = classifier.classify(summary, NO_EVIDENCE);
    // crash (0.95) beats locator_failure (0.9)
    expect(result.category).toBe('crash');
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
  });

  // ── Top-level error vs step error ─────────────────────────────────────────
  it('reads top-level run error for classification', () => {
    const summary = makeSummary({
      error:          'Connection refused to API endpoint',
      failedStepList: [],
    });
    expect(classifier.classify(summary, NO_EVIDENCE).category).toBe('api_failure');
  });
});
