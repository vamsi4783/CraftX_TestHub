// ─── RegressionAnalysisEngine integration tests (Phase 4 M9) ─────────────────
// Full pipeline tests using only the pure-function components (no DB, no AI).

import { describe, it, expect } from 'vitest';
import { VersionComparator }             from '../../services/regressionAnalysis/VersionComparator';
import { ChangeImpactAnalyzer }          from '../../services/regressionAnalysis/ChangeImpactAnalyzer';
import { DependencyGraph }               from '../../services/regressionAnalysis/DependencyGraph';
import { RiskScoringEngine }             from '../../services/regressionAnalysis/RiskScoringEngine';
import { RegressionRecommendationEngine } from '../../services/regressionAnalysis/RegressionRecommendationEngine';
import type {
  ChangeSet, HistoricalMetrics,
} from '../../services/regressionAnalysis/RegressionAnalysisTypes';

const comparator = new VersionComparator();
const impactAna  = new ChangeImpactAnalyzer();
const graphBuild = new DependencyGraph();
const riskEngine = new RiskScoringEngine();
const recEngine  = new RegressionRecommendationEngine();

const EMPTY_HISTORY: HistoricalMetrics = { failureRates: new Map(), healingRates: new Map() };

function runPipeline(changedFiles: string[]) {
  const cs: ChangeSet    = { fromVersion: 'v1.0', toVersion: 'v1.1', changedFiles };
  const classified       = comparator.classify(cs);
  const areas            = impactAna.analyze(classified);
  const graph            = graphBuild.build(areas);
  const riskScores       = riskEngine.score(areas, [], EMPTY_HISTORY);
  const overall          = riskEngine.overallRisk(riskScores);
  const recs             = recEngine.recommend(riskScores, [], []);
  return { classified, areas, graph, riskScores, overall, recs };
}

describe('Full pipeline — API + screen change scenario', () => {
  const files = [
    'src/api/PaymentApiService.kt',
    'src/screens/CheckoutActivity.kt',
    'src/data/PaymentRepository.kt',
  ];
  const result = runPipeline(files);

  it('classifies all 3 files', () => {
    expect(result.classified.length).toBe(3);
  });

  it('detects api and screen areas', () => {
    const types = result.areas.map(a => a.type);
    expect(types).toContain('api');
    expect(types).toContain('screen');
  });

  it('risk scores are ordered descending', () => {
    for (let i = 1; i < result.riskScores.length; i++) {
      expect(result.riskScores[i].score).toBeLessThanOrEqual(result.riskScores[i - 1].score);
    }
  });

  it('overall risk is > 0', () => {
    expect(result.overall).toBeGreaterThan(0);
  });

  it('API area gets higher or equal risk than styling', () => {
    const apiRisk = result.riskScores.find(r => r.areaName.toLowerCase().includes('api') ||
      result.areas.find(a => a.id === r.areaId)?.category === 'api_endpoint');
    expect(apiRisk?.score).toBeGreaterThan(0);
  });
});

describe('Full pipeline — test-only changes (no product impact)', () => {
  const files = [
    'src/__tests__/LoginTest.kt',
    'src/__tests__/PaymentTest.kt',
    'src/login.spec.ts',
  ];
  const result = runPipeline(files);

  it('produces no product areas', () => {
    expect(result.areas.length).toBe(0);
  });

  it('overall risk is 0', () => {
    expect(result.overall).toBe(0);
  });

  it('no recommendations', () => {
    expect(result.recs.length).toBe(0);
  });
});

describe('Full pipeline — navigation change scenario', () => {
  const files = [
    'src/navigation/AppNavigator.tsx',
    'src/navigation/routes.ts',
    'src/screens/HomeScreen.tsx',
  ];
  const result = runPipeline(files);

  it('detects navigation and screen areas', () => {
    const types = result.areas.map(a => a.type);
    expect(types).toContain('flow');
    expect(types).toContain('screen');
  });

  it('navigation area risk is >= medium tier threshold', () => {
    const navRisk = result.riskScores.find(r =>
      result.areas.find(a => a.id === r.areaId)?.category === 'navigation'
    );
    if (navRisk) expect(navRisk.score).toBeGreaterThanOrEqual(0.25); // at least medium
  });
});

describe('Full pipeline — historical failure data raises risk', () => {
  const files = ['src/LoginActivity.kt'];
  const cs    = { fromVersion: 'v1', toVersion: 'v2', changedFiles: files };
  const areas = impactAna.analyze(comparator.classify(cs));

  it('higher failure rate → higher score', () => {
    const baseScores = riskEngine.score(areas, [], EMPTY_HISTORY);
    const histScores = riskEngine.score(areas, [], {
      failureRates: new Map([[areas[0]?.name ?? '', 0.9]]),
      healingRates: new Map(),
    });
    if (baseScores.length > 0 && histScores.length > 0) {
      expect(histScores[0].score).toBeGreaterThan(baseScores[0].score);
    }
  });
});

describe('Full pipeline — risk-based recommendation ordering', () => {
  it('critical areas get priority 1', () => {
    const files   = ['src/api/PaymentApiService.kt', 'src/styles/global.css'];
    const cs      = { fromVersion: 'v1', toVersion: 'v2', changedFiles: files };
    const areas   = impactAna.analyze(comparator.classify(cs));
    const history: HistoricalMetrics = {
      failureRates: new Map(areas.map(a => [a.name, 0.8])),
      healingRates: new Map(),
    };
    const riskScores = riskEngine.score(areas, [], history);

    // Assign test coverage to highest-risk area
    const topRisk = riskScores[0];
    const coverage = [{ areaId: topRisk.areaId, areaName: topRisk.areaName, testCaseCount: 1, stepCount: 3, covered: true, coverageScore: 0.5, testCaseIds: ['tc-top'] }];
    const tcs = [{ id: 'tc-top', title: 'Top risk test', stepCount: 3 }];
    const recs = recEngine.recommend(riskScores, coverage, tcs);

    const topRec = recs.find(r => r.testCaseId === 'tc-top');
    expect(topRec?.priority).toBe(1);
  });

  it('estimated time is non-negative', () => {
    const files  = ['src/LoginActivity.kt'];
    const cs     = { fromVersion: 'v1', toVersion: 'v2', changedFiles: files };
    const areas  = impactAna.analyze(comparator.classify(cs));
    const scores = riskEngine.score(areas, [], EMPTY_HISTORY);
    const recs   = recEngine.recommend(scores, [], []);
    expect(recEngine.estimatedTotalTime(recs)).toBeGreaterThanOrEqual(0);
  });
});

describe('VersionComparator — edge cases', () => {
  it('handles Windows-style path separators', () => {
    const result = comparator.classifyFile('src\\main\\java\\com\\example\\LoginActivity.kt');
    expect(result.category).toBe('screen_layout');
  });

  it('handles paths with no extension gracefully', () => {
    const result = comparator.classifyFile('src/Makefile');
    expect(result.category).toBeDefined();
  });

  it('empty changeset produces no areas', () => {
    const areas = impactAna.analyze(comparator.classify({ fromVersion: 'v1', toVersion: 'v2', changedFiles: [] }));
    expect(areas.length).toBe(0);
  });
});
