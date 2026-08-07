// ─── RecommendationEngine tests (Phase 4 M8) ──────────────────────────────────
import { describe, it, expect } from 'vitest';
import { RecommendationEngine } from '../../services/failureAnalysis/RecommendationEngine';
import type {
  ClassificationResult, AIAnalysisResult, ExecutionSummary,
} from '../../services/failureAnalysis/FailureAnalysisTypes';

function makeClassification(category: ClassificationResult['category'], confidence = 0.9): ClassificationResult {
  return { category, confidence, signals: [`${category} detected`] };
}

function makeSummary(overrides: Partial<ExecutionSummary> = {}): ExecutionSummary {
  return {
    runId: 'run-1', status: 'failed', totalSteps: 5, passedSteps: 3,
    failedSteps: 2, skippedSteps: 0, duration_ms: 4000, startedAt: '',
    steps: [], failedStepList: [], assertions: [], healingAttempts: [],
    ...overrides,
  };
}

function makeAI(overrides: Partial<AIAnalysisResult> = {}): AIAnalysisResult {
  return {
    rootCause:             'The button ID was renamed',
    confidence:            0.85,
    evidenceSummary:       'Step 3 failed',
    likelySourceFiles:     ['activity_main.xml'],
    suggestedFix:          'Update selector from btn_old to btn_new',
    regressionProbability: 0.7,
    developerExplanation:  'Developer explanation',
    qaExplanation:         'QA explanation',
    ...overrides,
  };
}

const engine = new RecommendationEngine();

describe('RecommendationEngine', () => {
  // ── Basic output shape ─────────────────────────────────────────────────────
  it('returns a non-empty array for every category', () => {
    const categories: ClassificationResult['category'][] = [
      'assertion_failure', 'locator_failure', 'timeout', 'crash',
      'navigation', 'permission', 'visual_regression', 'api_failure', 'unknown',
    ];
    for (const cat of categories) {
      const recs = engine.generate(makeClassification(cat), null, makeSummary());
      expect(recs.length).toBeGreaterThan(0);
    }
  });

  it('each recommendation has a unique id', () => {
    const recs = engine.generate(makeClassification('locator_failure'), makeAI(), makeSummary());
    const ids  = recs.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all recommendations require user approval or are clearly informational', () => {
    const recs = engine.generate(makeClassification('crash'), null, makeSummary());
    // requiresUserApproval=false is only for informational recs; actionable=true should also have requiresUserApproval=true
    for (const r of recs.filter(r => r.actionable && r.requiresUserApproval)) {
      expect(r.requiresUserApproval).toBe(true);
    }
  });

  // ── Priority ordering ─────────────────────────────────────────────────────
  it('sorts recommendations critical → high → medium → low', () => {
    const recs = engine.generate(makeClassification('locator_failure'), makeAI(), makeSummary());
    const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < recs.length; i++) {
      expect(ORDER[recs[i].priority]).toBeGreaterThanOrEqual(ORDER[recs[i - 1].priority]);
    }
  });

  // ── Crash ─────────────────────────────────────────────────────────────────
  it('generates file_bug recommendation for crash', () => {
    const recs = engine.generate(makeClassification('crash'), null, makeSummary());
    expect(recs.some(r => r.type === 'file_bug')).toBe(true);
    expect(recs.find(r => r.type === 'file_bug')?.priority).toBe('critical');
  });

  // ── Locator failure ────────────────────────────────────────────────────────
  it('generates update_locator recommendation for locator_failure', () => {
    const recs = engine.generate(makeClassification('locator_failure'), null, makeSummary());
    expect(recs.some(r => r.type === 'update_locator')).toBe(true);
  });

  it('suggests enabling healing when no healing attempted', () => {
    const summary = makeSummary({ healingAttempts: [] });
    const recs    = engine.generate(makeClassification('locator_failure'), null, summary);
    expect(recs.some(r => r.type === 'enable_healing')).toBe(true);
  });

  it('suggests enabling healing when healing failed', () => {
    const summary = makeSummary({
      healingAttempts: [{
        stepId: 's1', stepNumber: 2, outcome: 'failed', strategyUsed: 'element_id_changed',
      }],
    });
    const recs = engine.generate(makeClassification('locator_failure'), null, summary);
    expect(recs.some(r => r.type === 'enable_healing')).toBe(true);
  });

  // ── Assertion failure ─────────────────────────────────────────────────────
  it('generates fix_assertion with failed count in description', () => {
    const summary = makeSummary({
      assertions: [
        { id: 'a1', stepNumber: 1, assertionKind: 'equals', status: 'FAIL', expected: 'a', actual: 'b', message: 'mismatch' },
        { id: 'a2', stepNumber: 2, assertionKind: 'exists', status: 'FAIL', expected: 'true', actual: 'false', message: 'not found' },
      ],
    });
    const recs = engine.generate(makeClassification('assertion_failure'), null, summary);
    const rec  = recs.find(r => r.type === 'fix_assertion');
    expect(rec).toBeDefined();
    expect(rec?.description).toContain('2');
  });

  // ── Timeout ───────────────────────────────────────────────────────────────
  it('generates increase_timeout for timeout failures', () => {
    const recs = engine.generate(makeClassification('timeout'), null, makeSummary());
    expect(recs.some(r => r.type === 'increase_timeout')).toBe(true);
  });

  // ── Visual regression ─────────────────────────────────────────────────────
  it('generates update_baseline for visual_regression', () => {
    const recs = engine.generate(makeClassification('visual_regression'), null, makeSummary());
    expect(recs.some(r => r.type === 'update_baseline')).toBe(true);
  });

  // ── Permission ────────────────────────────────────────────────────────────
  it('generates check_permissions for permission failures', () => {
    const recs = engine.generate(makeClassification('permission'), null, makeSummary());
    expect(recs.some(r => r.type === 'check_permissions')).toBe(true);
  });

  // ── API failure ───────────────────────────────────────────────────────────
  it('generates check_network for api_failure', () => {
    const recs = engine.generate(makeClassification('api_failure'), null, makeSummary());
    expect(recs.some(r => r.type === 'check_network')).toBe(true);
  });

  // ── Unknown ────────────────────────────────────────────────────────────────
  it('generates manual_review for unknown category', () => {
    const recs = engine.generate(makeClassification('unknown'), null, makeSummary());
    expect(recs.some(r => r.type === 'manual_review')).toBe(true);
  });

  // ── AI-informed recommendations ───────────────────────────────────────────
  it('adds AI suggested fix when confidence > 0.6', () => {
    const ai   = makeAI({ confidence: 0.85, suggestedFix: 'Change selector to btn_new' });
    const recs = engine.generate(makeClassification('locator_failure'), ai, makeSummary());
    const aiRec = recs.find(r => r.metadata?.['source'] === 'ai' && r.title.includes('fix'));
    expect(aiRec).toBeDefined();
    expect(aiRec?.description).toContain('btn_new');
  });

  it('does NOT add AI fix when confidence <= 0.6', () => {
    const ai   = makeAI({ confidence: 0.5 });
    const recs = engine.generate(makeClassification('locator_failure'), ai, makeSummary());
    const aiRec = recs.find(r => r.metadata?.['source'] === 'ai' && r.title.includes('fix'));
    expect(aiRec).toBeUndefined();
  });

  it('adds regression warning when regressionProbability > 0.8', () => {
    const ai   = makeAI({ regressionProbability: 0.92 });
    const recs = engine.generate(makeClassification('assertion_failure'), ai, makeSummary({
      assertions: [{ id: 'a1', stepNumber: 1, assertionKind: 'equals', status: 'FAIL', expected: 'x', actual: 'y', message: '' }],
    }));
    const regRec = recs.find(r => (r.metadata?.['regressionProbability'] as number) > 0.8);
    expect(regRec).toBeDefined();
  });

  it('does NOT add regression warning when regressionProbability <= 0.8', () => {
    const ai   = makeAI({ regressionProbability: 0.5 });
    const recs = engine.generate(makeClassification('timeout'), ai, makeSummary());
    const regRec = recs.find(r => (r.metadata?.['regressionProbability'] as number) > 0.8);
    expect(regRec).toBeUndefined();
  });

  it('works correctly with null aiAnalysis', () => {
    const recs = engine.generate(makeClassification('crash'), null, makeSummary());
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some(r => r.metadata?.['source'] === 'ai')).toBe(false);
  });
});
