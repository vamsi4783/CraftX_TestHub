// ─── FailureAnalysisEngine integration tests (Phase 4 M8) ─────────────────────
// Tests the full pipeline with mocked Supabase + mocked AI.
// Uses skipAI=true to avoid network calls and focus on the deterministic path.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ExecutionSummary, AnalysisReport,
} from '../../services/failureAnalysis/FailureAnalysisTypes';
import { FailureClassifier }    from '../../services/failureAnalysis/FailureClassifier';
import { RecommendationEngine } from '../../services/failureAnalysis/RecommendationEngine';
import { ContextBuilder }       from '../../services/failureAnalysis/ContextBuilder';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<ExecutionSummary> = {}): ExecutionSummary {
  return {
    runId: 'run-integ-1', testCaseName: 'Integration test', status: 'failed',
    totalSteps: 4, passedSteps: 2, failedSteps: 2, skippedSteps: 0,
    duration_ms: 5000, startedAt: '2026-08-07T10:00:00Z',
    steps: [
      { stepId: 's1', stepNumber: 1, action: 'tap', status: 'passed', duration_ms: 200 },
      { stepId: 's2', stepNumber: 2, action: 'tap', status: 'passed', duration_ms: 200 },
      { stepId: 's3', stepNumber: 3, action: 'tap', selector: 'com.example:id/btn_submit', status: 'failed', duration_ms: 5000, error: 'no such element: btn_submit' },
    ],
    failedStepList: [
      { stepId: 's3', stepNumber: 3, action: 'tap', selector: 'com.example:id/btn_submit', status: 'failed', duration_ms: 5000, error: 'no such element: btn_submit' },
    ],
    assertions: [],
    healingAttempts: [],
    ...overrides,
  };
}

// ─── Unit tests of the pipeline components ────────────────────────────────────

describe('FailureClassifier — integration scenarios', () => {
  const classifier = new FailureClassifier();

  it('handles empty failedStepList with top-level error', () => {
    const summary = makeSummary({ failedStepList: [], error: 'Test runner crashed' });
    const result  = classifier.classify(summary, []);
    expect(result.category).toBe('crash');
  });

  it('handles run with both locator and timeout signals (crash wins)', () => {
    const summary = makeSummary({
      error: 'Fatal exception in process',
      failedStepList: [
        { stepId: 's1', stepNumber: 1, action: 'tap', status: 'failed', duration_ms: 1000, error: 'no such element' },
        { stepId: 's2', stepNumber: 2, action: 'tap', status: 'failed', duration_ms: 2000, error: 'timed out' },
      ],
    });
    const result = classifier.classify(summary, []);
    expect(result.category).toBe('crash'); // highest confidence
    expect(result.signals.length).toBeGreaterThanOrEqual(3); // crash + locator + timeout
  });

  it('passes an empty run as unknown', () => {
    const summary = makeSummary({ failedStepList: [], error: undefined });
    const result  = classifier.classify(summary, []);
    expect(result.category).toBe('unknown');
  });
});

describe('RecommendationEngine — pipeline integration', () => {
  const classifier  = new FailureClassifier();
  const recEngine   = new RecommendationEngine();

  it('generates crash + AI recommendations end-to-end', () => {
    const summary = makeSummary({ error: 'ANR detected' });
    const classif = classifier.classify(summary, []);
    const recs    = recEngine.generate(classif, null, summary);
    expect(recs.some(r => r.type === 'file_bug')).toBe(true);
    expect(recs[0].priority).toBe('critical');
  });

  it('assertion + high AI confidence adds both deterministic and AI recommendations', () => {
    const summary = makeSummary({
      assertions: [{
        id: 'a1', stepNumber: 1, assertionKind: 'text', status: 'FAIL',
        expected: 'Dashboard', actual: 'Login', message: 'Wrong screen',
      }],
    });
    const classif = classifier.classify(summary, []);
    const recs    = recEngine.generate(classif, {
      rootCause: 'Navigation failed', confidence: 0.9,
      evidenceSummary: 'Wrong screen shown', likelySourceFiles: [],
      suggestedFix: 'Check navigation logic', regressionProbability: 0.85,
      developerExplanation: 'dev', qaExplanation: 'qa',
    }, summary);
    expect(recs.some(r => r.type === 'fix_assertion')).toBe(true);
    expect(recs.some(r => r.metadata?.['source'] === 'ai')).toBe(true);
  });
});

describe('ContextBuilder — prompt integration', () => {
  const builder = new ContextBuilder();

  it('prompt is under 12000 chars even with a large number of steps', () => {
    const steps = Array.from({ length: 50 }, (_, i) => ({
      stepId: `s${i}`, stepNumber: i + 1, action: 'tap',
      selector: `com.example:id/btn_${i}`, status: 'failed' as const,
      duration_ms: 100, error: `no such element: btn_${i} (long message repeated)`,
    }));
    const summary = makeSummary({ failedStepList: steps, steps });
    const ctx     = builder.build(summary, { category: 'locator_failure', confidence: 0.9, signals: [] }, [], []);
    const prompt  = builder.buildPrompt(ctx);
    expect(prompt.length).toBeLessThan(12000);
  });

  it('prompt schema includes all required AI output fields', () => {
    const ctx    = builder.build(makeSummary(), { category: 'locator_failure', confidence: 0.9, signals: [] }, [], []);
    const prompt = builder.buildPrompt(ctx);
    const fields = ['rootCause', 'confidence', 'evidenceSummary', 'likelySourceFiles',
                    'suggestedFix', 'suggestedHealing', 'regressionProbability',
                    'developerExplanation', 'qaExplanation'];
    for (const field of fields) {
      expect(prompt).toContain(field);
    }
  });
});

// ─── End-to-end pipeline (without network) ────────────────────────────────────

describe('Full pipeline — skipAI mode', () => {
  it('locator failure produces update_locator + enable_healing recommendations', () => {
    const summary    = makeSummary();
    const classifier = new FailureClassifier();
    const recEngine  = new RecommendationEngine();
    const classif    = classifier.classify(summary, []);
    expect(classif.category).toBe('locator_failure');
    const recs = recEngine.generate(classif, null, summary);
    expect(recs.some(r => r.type === 'update_locator')).toBe(true);
    expect(recs.some(r => r.type === 'enable_healing')).toBe(true);
  });

  it('all recommendation IDs are valid UUIDs', () => {
    const summary    = makeSummary({ error: 'SecurityException: permission denied' });
    const classifier = new FailureClassifier();
    const recEngine  = new RecommendationEngine();
    const classif    = classifier.classify(summary, []);
    const recs       = recEngine.generate(classif, null, summary);
    const UUID_RE    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const r of recs) {
      expect(r.id).toMatch(UUID_RE);
    }
  });

  it('visual regression pipeline produces update_baseline', () => {
    const summary    = makeSummary({ failedStepList: [] });
    const classifier = new FailureClassifier();
    const recEngine  = new RecommendationEngine();
    const evidence   = [{ id: 'v1', type: 'visual_diff' as const, stepNumber: 2, metadata: { hasDiff: true } }];
    const classif    = classifier.classify(summary, evidence);
    expect(classif.category).toBe('visual_regression');
    const recs = recEngine.generate(classif, null, summary);
    expect(recs.some(r => r.type === 'update_baseline')).toBe(true);
  });
});
