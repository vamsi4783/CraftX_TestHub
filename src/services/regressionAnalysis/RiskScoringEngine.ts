// ─── RiskScoringEngine (Phase 4 M9) ───────────────────────────────────────────
// Computes a 0-1 risk score per impacted area from four weighted factors.
// Pure deterministic — no network, no DB (callers pre-fetch history).

import type {
  ImpactedArea, CoverageResult, RiskScore, RiskTier, RiskFactors, HistoricalMetrics,
} from './RegressionAnalysisTypes';

// Weight constants — must sum to 1.0
const W_CHANGE   = 0.40; // direct change impact
const W_FAILURE  = 0.35; // historical failure rate
const W_COVERAGE = 0.15; // coverage gap (1 - coverage)
const W_HEALING  = 0.10; // self-healing instability rate

function tier(score: number): RiskTier {
  if (score >= 0.75) return 'critical';
  if (score >= 0.50) return 'high';
  if (score >= 0.25) return 'medium';
  return 'low';
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, isNaN(n) ? 0 : n));
}

export class RiskScoringEngine {
  score(
    areas:    ImpactedArea[],
    coverage: CoverageResult[],
    history:  HistoricalMetrics,
  ): RiskScore[] {
    const coverageByAreaId = new Map(coverage.map(c => [c.areaId, c]));

    return areas.map(area => {
      const cov = coverageByAreaId.get(area.id);

      const factors: RiskFactors = {
        changeWeight:  clamp(area.riskFactor),
        failureRate:   clamp(history.failureRates.get(area.name) ?? this._estimateFailureRate(area)),
        coverageGap:   clamp(1 - (cov?.coverageScore ?? 0)),
        healingRate:   clamp(history.healingRates.get(area.name) ?? 0),
      };

      const score = clamp(
        factors.changeWeight  * W_CHANGE  +
        factors.failureRate   * W_FAILURE +
        factors.coverageGap   * W_COVERAGE +
        factors.healingRate   * W_HEALING,
      );

      return {
        areaId:   area.id,
        areaName: area.name,
        score,
        tier:     tier(score),
        factors,
      };
    }).sort((a, b) => b.score - a.score);
  }

  /** Compute the weighted overall risk (0-1) across all areas. */
  overallRisk(scores: RiskScore[]): number {
    if (scores.length === 0) return 0;
    // Weighted average biased toward the top scores
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    let weightSum = 0;
    let scoreSum  = 0;
    sorted.forEach((s, i) => {
      const w = 1 / (i + 1); // harmonic weighting
      weightSum += w;
      scoreSum  += s.score * w;
    });
    return clamp(scoreSum / weightSum);
  }

  /** Heuristic failure-rate estimate when no historical data is available. */
  private _estimateFailureRate(area: ImpactedArea): number {
    switch (area.category) {
      case 'api_endpoint':   return 0.3;
      case 'navigation':     return 0.25;
      case 'business_logic': return 0.2;
      case 'screen_layout':  return 0.15;
      case 'data_model':     return 0.25;
      case 'configuration':  return 0.1;
      case 'styling':        return 0.05;
      default:               return 0.15;
    }
  }
}
