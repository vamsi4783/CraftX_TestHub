// ─── RegressionRecommendationEngine (Phase 4 M9) ──────────────────────────────
// Selects and ranks existing test cases into a priority regression suite.
// Never modifies test cases — produces a read-only ordered list.

import type {
  RiskScore, CoverageResult, RegressionSuggestion, RiskTier,
} from './RegressionAnalysisTypes';

const AVG_SECONDS_PER_STEP = 5; // conservative estimate

interface TestCaseRecord {
  id:    string;
  title: string;
  stepCount: number;
}

export class RegressionRecommendationEngine {
  recommend(
    riskScores:   RiskScore[],
    coverage:     CoverageResult[],
    testCases:    TestCaseRecord[],
  ): RegressionSuggestion[] {
    // Build: testCaseId → max risk score from areas it covers
    const tcRiskMap = new Map<string, { score: number; areas: string[]; reasons: string[] }>();

    for (const cov of coverage) {
      const riskEntry = riskScores.find(r => r.areaId === cov.areaId);
      if (!riskEntry || cov.testCaseIds.length === 0) continue;

      for (const tcId of cov.testCaseIds) {
        const existing = tcRiskMap.get(tcId);
        if (!existing) {
          tcRiskMap.set(tcId, {
            score:   riskEntry.score,
            areas:   [cov.areaName],
            reasons: [this._reason(riskEntry)],
          });
        } else {
          if (riskEntry.score > existing.score) existing.score = riskEntry.score;
          if (!existing.areas.includes(cov.areaName)) {
            existing.areas.push(cov.areaName);
            existing.reasons.push(this._reason(riskEntry));
          }
        }
      }
    }

    // Also include test cases for high-risk areas that have NO coverage (to flag gaps)
    const highRiskUncovered = riskScores.filter(r => r.score >= 0.5 &&
      !coverage.some(c => c.areaId === r.areaId && c.covered));

    const suggestions: RegressionSuggestion[] = [];
    let priority = 1;

    // Ranked test cases
    const rankedTcs = Array.from(tcRiskMap.entries())
      .sort((a, b) => b[1].score - a[1].score);

    for (const [tcId, entry] of rankedTcs) {
      const tc = testCases.find(t => t.id === tcId);
      if (!tc) continue;
      suggestions.push({
        testCaseId:    tcId,
        testCaseName:  tc.title,
        priority:      priority++,
        riskScore:     entry.score,
        tier:          this._tier(entry.score),
        reasons:       entry.reasons.slice(0, 3),
        estimatedTime: tc.stepCount * AVG_SECONDS_PER_STEP,
        coverageAreas: entry.areas,
      });
    }

    // Append gap-coverage advisory entries (no test case ID)
    for (const risk of highRiskUncovered) {
      suggestions.push({
        testCaseId:    '',
        testCaseName:  `[No test] ${risk.areaName}`,
        priority:      priority++,
        riskScore:     risk.score,
        tier:          risk.tier,
        reasons:       [`No test coverage for ${risk.tier}-risk area "${risk.areaName}"`],
        estimatedTime: 0,
        coverageAreas: [risk.areaName],
      });
    }

    return suggestions;
  }

  estimatedTotalTime(suggestions: RegressionSuggestion[]): number {
    return suggestions.reduce((sum, s) => sum + s.estimatedTime, 0);
  }

  private _tier(score: number): RiskTier {
    if (score >= 0.75) return 'critical';
    if (score >= 0.50) return 'high';
    if (score >= 0.25) return 'medium';
    return 'low';
  }

  private _reason(risk: RiskScore): string {
    const parts: string[] = [];
    if (risk.factors.changeWeight > 0.5) parts.push('directly changed');
    if (risk.factors.failureRate   > 0.4) parts.push('historically unstable');
    if (risk.factors.coverageGap   > 0.7) parts.push('under-tested');
    if (risk.factors.healingRate   > 0.3) parts.push('locator instability');
    return parts.length > 0
      ? `${risk.areaName}: ${parts.join(', ')}`
      : `${risk.areaName} risk score ${Math.round(risk.score * 100)}%`;
  }
}
