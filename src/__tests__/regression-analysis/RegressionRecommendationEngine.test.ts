// ─── RegressionRecommendationEngine tests (Phase 4 M9) ───────────────────────
import { describe, it, expect } from 'vitest';
import { RegressionRecommendationEngine } from '../../services/regressionAnalysis/RegressionRecommendationEngine';
import type {
  RiskScore, CoverageResult,
} from '../../services/regressionAnalysis/RegressionAnalysisTypes';

function makeRisk(areaId: string, areaName: string, score: number): RiskScore {
  const tier = score >= 0.75 ? 'critical' : score >= 0.5 ? 'high' : score >= 0.25 ? 'medium' : 'low';
  return {
    areaId, areaName, score, tier,
    factors: { changeWeight: score, failureRate: score * 0.5, coverageGap: 0.5, healingRate: 0.1 },
  };
}

function makeCoverage(areaId: string, areaName: string, tcIds: string[], score = 0.7): CoverageResult {
  return {
    areaId, areaName, testCaseCount: tcIds.length, stepCount: 5,
    covered: tcIds.length > 0, coverageScore: score,
    testCaseIds: tcIds,
  };
}

function makeTc(id: string, title: string, steps = 5) {
  return { id, title, stepCount: steps };
}

const engine = new RegressionRecommendationEngine();

describe('RegressionRecommendationEngine', () => {
  // ── Basic output ──────────────────────────────────────────────────────────
  it('returns empty when no risks', () => {
    expect(engine.recommend([], [], [])).toEqual([]);
  });

  it('returns gap entries for high-risk uncovered areas', () => {
    const risk = makeRisk('a1', 'Login', 0.8);
    const cov  = makeCoverage('a1', 'Login', [], 0); // no test cases
    const recs = engine.recommend([risk], [cov], []);
    expect(recs.some(r => r.testCaseId === '' && r.coverageAreas.includes('Login'))).toBe(true);
  });

  it('assigns priority starting at 1', () => {
    const risk = makeRisk('a1', 'Login', 0.9);
    const cov  = makeCoverage('a1', 'Login', ['tc1']);
    const tc   = makeTc('tc1', 'Login flow test');
    const recs = engine.recommend([risk], [cov], [tc]);
    expect(recs[0].priority).toBe(1);
  });

  it('ranks higher-risk areas first', () => {
    const r1   = makeRisk('a1', 'Payment', 0.9);
    const r2   = makeRisk('a2', 'Settings', 0.3);
    const c1   = makeCoverage('a1', 'Payment', ['tc1']);
    const c2   = makeCoverage('a2', 'Settings', ['tc2']);
    const tcs  = [makeTc('tc1', 'Payment test'), makeTc('tc2', 'Settings test')];
    const recs = engine.recommend([r1, r2], [c1, c2], tcs);
    // Payment (risk 0.9) should be ranked before Settings (0.3)
    const payIdx = recs.findIndex(r => r.coverageAreas.includes('Payment'));
    const setIdx = recs.findIndex(r => r.coverageAreas.includes('Settings'));
    if (payIdx !== -1 && setIdx !== -1) {
      expect(payIdx).toBeLessThan(setIdx);
    }
  });

  it('priorities are strictly increasing', () => {
    const risks = [makeRisk('a1', 'A', 0.9), makeRisk('a2', 'B', 0.6)];
    const covs  = [makeCoverage('a1', 'A', ['tc1']), makeCoverage('a2', 'B', ['tc2'])];
    const tcs   = [makeTc('tc1', 'Test A'), makeTc('tc2', 'Test B')];
    const recs  = engine.recommend(risks, covs, tcs);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i].priority).toBeGreaterThan(recs[i - 1].priority);
    }
  });

  // ── Tier assignment ───────────────────────────────────────────────────────
  it('critical risk → critical tier suggestion', () => {
    const risk = makeRisk('a1', 'Payment', 0.9);
    const cov  = makeCoverage('a1', 'Payment', ['tc1']);
    const tc   = makeTc('tc1', 'Payment test');
    const recs = engine.recommend([risk], [cov], [tc]);
    expect(recs[0].tier).toBe('critical');
  });

  it('low risk → low or medium tier suggestion', () => {
    const risk = makeRisk('a1', 'Colors', 0.1);
    const cov  = makeCoverage('a1', 'Colors', ['tc1']);
    const tc   = makeTc('tc1', 'Color test');
    const recs = engine.recommend([risk], [cov], [tc]);
    expect(['low', 'medium']).toContain(recs[0].tier);
  });

  // ── Estimated time ────────────────────────────────────────────────────────
  it('estimatedTime = stepCount * 5s', () => {
    const risk = makeRisk('a1', 'Login', 0.9);
    const cov  = makeCoverage('a1', 'Login', ['tc1']);
    const tc   = makeTc('tc1', 'Login test', 10); // 10 steps
    const recs = engine.recommend([risk], [cov], [tc]);
    const loginRec = recs.find(r => r.testCaseId === 'tc1');
    expect(loginRec?.estimatedTime).toBe(50); // 10 * 5
  });

  it('estimatedTotalTime sums all suggestions', () => {
    const recs = [
      { testCaseId: 'tc1', testCaseName: 'A', priority: 1, riskScore: 0.9, tier: 'critical' as const, reasons: [], estimatedTime: 50, coverageAreas: [] },
      { testCaseId: 'tc2', testCaseName: 'B', priority: 2, riskScore: 0.5, tier: 'high'    as const, reasons: [], estimatedTime: 30, coverageAreas: [] },
      { testCaseId: '',    testCaseName: 'C', priority: 3, riskScore: 0.8, tier: 'critical' as const, reasons: [], estimatedTime: 0,  coverageAreas: [] },
    ];
    expect(engine.estimatedTotalTime(recs)).toBe(80);
  });

  // ── Reasons ───────────────────────────────────────────────────────────────
  it('suggestions include at least one reason', () => {
    const risk = makeRisk('a1', 'Login', 0.8);
    const cov  = makeCoverage('a1', 'Login', ['tc1']);
    const tc   = makeTc('tc1', 'Login test');
    const recs = engine.recommend([risk], [cov], [tc]);
    expect(recs[0].reasons.length).toBeGreaterThan(0);
  });

  // ── Test case not found ───────────────────────────────────────────────────
  it('skips test cases not found in the provided list', () => {
    const risk = makeRisk('a1', 'Login', 0.9);
    const cov  = makeCoverage('a1', 'Login', ['tc-missing']);
    const recs = engine.recommend([risk], [cov], []); // no test cases provided
    // tc-missing not in list, so no suggestion with that tcId
    expect(recs.every(r => r.testCaseId !== 'tc-missing')).toBe(true);
  });

  // ── coverageAreas ─────────────────────────────────────────────────────────
  it('suggestion coverageAreas includes the matched area', () => {
    const risk = makeRisk('a1', 'Checkout', 0.8);
    const cov  = makeCoverage('a1', 'Checkout', ['tc1']);
    const tc   = makeTc('tc1', 'Checkout test');
    const recs = engine.recommend([risk], [cov], [tc]);
    expect(recs[0].coverageAreas).toContain('Checkout');
  });

  // ── Multi-area test case ──────────────────────────────────────────────────
  it('test case covering multiple areas gets max risk score', () => {
    const r1  = makeRisk('a1', 'Login',   0.9);
    const r2  = makeRisk('a2', 'Profile', 0.4);
    const c1  = makeCoverage('a1', 'Login',   ['tc1']);
    const c2  = makeCoverage('a2', 'Profile', ['tc1']); // same tc covers both
    const tc  = makeTc('tc1', 'Login + Profile test');
    const recs = engine.recommend([r1, r2], [c1, c2], [tc]);
    const rec = recs.find(r => r.testCaseId === 'tc1');
    expect(rec?.riskScore).toBeGreaterThanOrEqual(0.9); // max of 0.9 and 0.4
    expect(rec?.coverageAreas.length).toBeGreaterThanOrEqual(2);
  });
});
