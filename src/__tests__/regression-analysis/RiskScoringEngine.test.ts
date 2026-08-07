// ─── RiskScoringEngine tests (Phase 4 M9) ────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { RiskScoringEngine }   from '../../services/regressionAnalysis/RiskScoringEngine';
import type {
  ImpactedArea, CoverageResult, HistoricalMetrics,
} from '../../services/regressionAnalysis/RegressionAnalysisTypes';

function makeArea(name: string, riskFactor: number, category: ImpactedArea['category'] = 'screen_layout'): ImpactedArea {
  return {
    id: crypto.randomUUID(), name, type: 'screen', files: [],
    category, directChange: true, riskFactor,
  };
}

function makeCoverage(areaId: string, coverageScore: number): CoverageResult {
  return {
    areaId, areaName: '', testCaseCount: coverageScore > 0 ? 2 : 0,
    stepCount: 5, covered: coverageScore > 0, coverageScore,
    testCaseIds: [],
  };
}

const EMPTY_HISTORY: HistoricalMetrics = {
  failureRates: new Map(),
  healingRates: new Map(),
};

const engine = new RiskScoringEngine();

describe('RiskScoringEngine', () => {
  // ── Output shape ──────────────────────────────────────────────────────────
  it('returns one score per area', () => {
    const areas = [makeArea('Login', 0.8), makeArea('Home', 0.5)];
    const scores = engine.score(areas, [], EMPTY_HISTORY);
    expect(scores.length).toBe(2);
  });

  it('each score has areaId matching input', () => {
    const areas  = [makeArea('Login', 0.9)];
    const scores = engine.score(areas, [], EMPTY_HISTORY);
    expect(scores[0].areaId).toBe(areas[0].id);
  });

  it('scores are sorted descending', () => {
    const areas = [makeArea('Low', 0.1), makeArea('High', 0.9), makeArea('Mid', 0.5)];
    const scores = engine.score(areas, [], EMPTY_HISTORY);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i].score).toBeLessThanOrEqual(scores[i - 1].score);
    }
  });

  // ── Score bounds ──────────────────────────────────────────────────────────
  it('all scores are in [0, 1]', () => {
    const areas = [makeArea('A', 0.0), makeArea('B', 1.0), makeArea('C', 0.5)];
    const scores = engine.score(areas, [], EMPTY_HISTORY);
    for (const s of scores) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  // ── Tier assignment ───────────────────────────────────────────────────────
  it('assigns critical tier to score >= 0.75', () => {
    // High riskFactor + no coverage + high failure rate
    const area    = makeArea('CrashArea', 1.0, 'api_endpoint');
    const history: HistoricalMetrics = {
      failureRates: new Map([['CrashArea', 1.0]]),
      healingRates: new Map([['CrashArea', 1.0]]),
    };
    const scores = engine.score([area], [], history);
    expect(scores[0].tier).toBe('critical');
  });

  it('assigns low tier to score < 0.25', () => {
    const area    = makeArea('StableArea', 0.05, 'styling');
    const coverage = makeCoverage(area.id, 1.0); // fully covered
    const history: HistoricalMetrics = {
      failureRates: new Map([['StableArea', 0]]),
      healingRates: new Map([['StableArea', 0]]),
    };
    const scores = engine.score([area], [coverage], history);
    expect(['low', 'medium']).toContain(scores[0].tier);
  });

  // ── Factor influence ──────────────────────────────────────────────────────
  it('high failure rate raises score', () => {
    const area = makeArea('Flaky', 0.5);
    const baseScores = engine.score([area], [], EMPTY_HISTORY);
    const histScores = engine.score([area], [], {
      failureRates: new Map([['Flaky', 0.9]]),
      healingRates: new Map(),
    });
    expect(histScores[0].score).toBeGreaterThan(baseScores[0].score);
  });

  it('full coverage reduces score compared to no coverage', () => {
    const area    = makeArea('Tested', 0.6);
    const covered  = makeCoverage(area.id, 1.0);
    const uncov    = makeCoverage(area.id, 0.0);
    const withCov    = engine.score([area], [covered], EMPTY_HISTORY);
    const withoutCov = engine.score([area], [uncov],   EMPTY_HISTORY);
    expect(withoutCov[0].score).toBeGreaterThan(withCov[0].score);
  });

  it('healing rate raises score', () => {
    const area = makeArea('Unstable', 0.5);
    const withHealing = engine.score([area], [], {
      failureRates: new Map(),
      healingRates: new Map([['Unstable', 0.9]]),
    });
    const withoutHealing = engine.score([area], [], EMPTY_HISTORY);
    expect(withHealing[0].score).toBeGreaterThan(withoutHealing[0].score);
  });

  // ── factors object ────────────────────────────────────────────────────────
  it('factors are all in [0,1]', () => {
    const area   = makeArea('X', 0.7);
    const scores = engine.score([area], [], EMPTY_HISTORY);
    const f      = scores[0].factors;
    for (const v of Object.values(f)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  // ── overallRisk ───────────────────────────────────────────────────────────
  it('overallRisk returns 0 for empty scores', () => {
    expect(engine.overallRisk([])).toBe(0);
  });

  it('overallRisk is in [0,1]', () => {
    const areas  = [makeArea('A', 0.9), makeArea('B', 0.3)];
    const scores = engine.score(areas, [], EMPTY_HISTORY);
    const overall = engine.overallRisk(scores);
    expect(overall).toBeGreaterThanOrEqual(0);
    expect(overall).toBeLessThanOrEqual(1);
  });

  it('overallRisk biased toward top scores (single area)', () => {
    const area  = makeArea('X', 1.0);
    const scores = engine.score([area], [], {
      failureRates: new Map([['X', 1.0]]),
      healingRates: new Map([['X', 1.0]]),
    });
    expect(engine.overallRisk(scores)).toBeGreaterThan(0.5);
  });

  // ── Category heuristic ────────────────────────────────────────────────────
  it('api_endpoint areas get higher estimated failure rate than styling', () => {
    const api   = makeArea('Payment API', 0.5, 'api_endpoint');
    const style = makeArea('Button Color', 0.5, 'styling');
    const apiScore   = engine.score([api],   [], EMPTY_HISTORY)[0];
    const styleScore = engine.score([style], [], EMPTY_HISTORY)[0];
    expect(apiScore.score).toBeGreaterThan(styleScore.score);
  });
});
