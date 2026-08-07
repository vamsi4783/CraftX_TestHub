// ─── RegressionAnalysisEngine (Phase 4 M9) ────────────────────────────────────
// Orchestrator: classify → impact → graph → coverage → risk → recommend → AI → persist.

import { supabase }                      from '@/lib/supabase';
import { VersionComparator }             from './VersionComparator';
import { ChangeImpactAnalyzer }          from './ChangeImpactAnalyzer';
import { DependencyGraph }               from './DependencyGraph';
import { CoverageAnalyzer }              from './CoverageAnalyzer';
import { RiskScoringEngine }             from './RiskScoringEngine';
import { RegressionRecommendationEngine } from './RegressionRecommendationEngine';
import { AIRegressionEngine }            from './AIRegressionEngine';
import type {
  ChangeSet, RegressionReport, RegressionSummary, HistoricalMetrics,
} from './RegressionAnalysisTypes';

// Re-export for callers
export type { HistoricalMetrics } from './RegressionAnalysisTypes';

const uuidv4 = () => crypto.randomUUID();

export interface RegressionAnalysisOptions {
  skipAI?: boolean;
}

export class RegressionAnalysisEngine {
  private readonly comparator        = new VersionComparator();
  private readonly impactAnalyzer    = new ChangeImpactAnalyzer();
  private readonly depGraph          = new DependencyGraph();
  private readonly coverageAnalyzer  = new CoverageAnalyzer();
  private readonly riskEngine        = new RiskScoringEngine();
  private readonly recEngine         = new RegressionRecommendationEngine();
  private readonly aiEngine          = new AIRegressionEngine();

  async analyze(
    changeSet: ChangeSet,
    options:   RegressionAnalysisOptions = {},
  ): Promise<RegressionReport> {
    const id        = uuidv4();
    const createdAt = new Date().toISOString();

    // ── 1. Classify changed files ─────────────────────────────────────────────
    const classifiedFiles = this.comparator.classify(changeSet);

    // ── 2. Determine impacted areas ───────────────────────────────────────────
    const impactedAreas = this.impactAnalyzer.analyze(classifiedFiles);

    // ── 3. Build dependency graph ─────────────────────────────────────────────
    const dependencyGraph = this.depGraph.build(impactedAreas, changeSet.projectModel);

    // ── 4. Coverage analysis (reads DB) ──────────────────────────────────────
    const coverageResults = await this.coverageAnalyzer.analyze(impactedAreas);

    // ── 5. Load historical failure + healing metrics ──────────────────────────
    const history = await this._loadHistoricalMetrics(impactedAreas.map(a => a.name));

    // ── 6. Risk scoring ───────────────────────────────────────────────────────
    const riskScores  = this.riskEngine.score(impactedAreas, coverageResults, history);
    const overallRisk = this.riskEngine.overallRisk(riskScores);

    // ── 7. Load test cases for recommendations ────────────────────────────────
    const testCases = await this._loadTestCases(coverageResults);

    // ── 8. Regression recommendations ────────────────────────────────────────
    const suggestions = this.recEngine.recommend(riskScores, coverageResults, testCases);

    // ── 9. AI analysis (optional) ─────────────────────────────────────────────
    let aiInsights = null;
    if (!options.skipAI) {
      try {
        aiInsights = await this.aiEngine.analyze({
          fromVersion:    changeSet.fromVersion,
          toVersion:      changeSet.toVersion,
          changedFiles:   changeSet.changedFiles,
          impactedAreas,
          riskScores,
          coverageResults,
          commitMessages: (changeSet.commits ?? []).map(c => c.message),
          projectType:    changeSet.projectType ?? 'generic',
        });
      } catch (err) {
        console.warn('RegressionAnalysisEngine: AI failed, continuing without it:', err);
      }
    }

    // ── 10. Build summary ─────────────────────────────────────────────────────
    const summary: RegressionSummary = {
      totalChangedFiles:  changeSet.changedFiles.length,
      impactedScreens:    impactedAreas.filter(a => a.type === 'screen').length,
      impactedAPIs:       impactedAreas.filter(a => a.type === 'api').length,
      coverageGapPct:     coverageResults.length > 0
        ? Math.round(coverageResults.filter(c => !c.covered).length / coverageResults.length * 100)
        : 0,
      criticalCount:      riskScores.filter(r => r.tier === 'critical').length,
      highCount:          riskScores.filter(r => r.tier === 'high').length,
      suggestedTestCount: suggestions.filter(s => s.testCaseId).length,
      estimatedTotalTime: this.recEngine.estimatedTotalTime(suggestions),
      overallRisk,
    };

    const report: RegressionReport = {
      id, createdAt, changeSet, classifiedFiles, impactedAreas,
      dependencyGraph, coverageResults, riskScores, suggestions, aiInsights, summary,
      fromVersion: changeSet.fromVersion,
      toVersion:   changeSet.toVersion,
    };

    // ── 11. Persist ───────────────────────────────────────────────────────────
    await this._persist(report);

    return report;
  }

  async listReports(limit = 20): Promise<RegressionReport[]> {
    const { data } = await supabase
      .from('regression_reports')
      .select('report_json, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data ?? []).map(row => {
      try { return JSON.parse(String(row['report_json'] ?? '{}')); }
      catch { return null; }
    }).filter(Boolean);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _loadHistoricalMetrics(areaNames: string[]): Promise<HistoricalMetrics> {
    const failureRates = new Map<string, number>();
    const healingRates = new Map<string, number>();

    // Failure history from M8
    const { data: failureData } = await supabase
      .from('failure_analysis_history')
      .select('failure_category, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    const totalFailures = (failureData ?? []).length;
    if (totalFailures > 0) {
      const categoryCount = new Map<string, number>();
      for (const row of (failureData ?? [])) {
        const cat = String(row['failure_category'] ?? '');
        categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + 1);
      }
      // Map categories to area names heuristically
      for (const name of areaNames) {
        const lower = name.toLowerCase();
        let rate = 0;
        if (/api|endpoint|service|network/.test(lower)) rate = (categoryCount.get('api_failure') ?? 0) / totalFailures;
        else if (/login|auth|screen|activity/.test(lower))   rate = (categoryCount.get('locator_failure') ?? 0) / totalFailures;
        else if (/nav|router|flow/.test(lower))             rate = (categoryCount.get('navigation') ?? 0) / totalFailures;
        if (rate > 0) failureRates.set(name, Math.min(1, rate * 3)); // amplify for relevance
      }
    }

    // Healing history from M7
    const { data: healingData } = await supabase
      .from('healing_events')
      .select('outcome, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    const totalHealing = (healingData ?? []).length;
    if (totalHealing > 0) {
      const healedCount = (healingData ?? []).filter(h => String(h['outcome']) === 'healed').length;
      const globalHealingRate = healedCount / totalHealing;
      // Apply as a global baseline (no area-specific mapping without step data)
      for (const name of areaNames) {
        healingRates.set(name, globalHealingRate * 0.5); // halve: not all healing is related
      }
    }

    return { failureRates, healingRates };
  }

  private async _loadTestCases(coverage: import('./RegressionAnalysisTypes').CoverageResult[]) {
    const allTcIds = [...new Set(coverage.flatMap(c => c.testCaseIds))];
    if (allTcIds.length === 0) return [];

    const { data } = await supabase
      .from('test_cases')
      .select('id, title, automation_config')
      .in('id', allTcIds);

    return (data ?? []).map(row => ({
      id:        String(row['id'] ?? ''),
      title:     String(row['title'] ?? ''),
      stepCount: (row['automation_config'] as { steps?: unknown[] } | null)?.steps?.length ?? 0,
    }));
  }

  private async _persist(report: RegressionReport): Promise<void> {
    const { data: reportRow } = await supabase
      .from('regression_reports')
      .insert({
        id:                   report.id,
        from_version:         report.fromVersion,
        to_version:           report.toVersion,
        changed_files:        report.changeSet.changedFiles,
        overall_risk:         report.summary.overallRisk,
        critical_count:       report.summary.criticalCount,
        high_count:           report.summary.highCount,
        suggested_test_count: report.summary.suggestedTestCount,
        estimated_total_time: report.summary.estimatedTotalTime,
        impacted_areas:       report.impactedAreas,
        risk_scores:          report.riskScores,
        suggestions:          report.suggestions,
        ai_insights:          report.aiInsights,
        summary:              report.summary,
        report_json:          JSON.stringify(report),
      })
      .select('id')
      .maybeSingle();

    if (!reportRow) return;

    // Persist risk history for trend tracking
    const historyRows = report.riskScores.map(r => ({
      report_id:    report.id,
      area_id:      r.areaId,
      area_name:    r.areaName,
      risk_score:   r.score,
      risk_tier:    r.tier,
      from_version: report.fromVersion,
      to_version:   report.toVersion,
    }));
    if (historyRows.length > 0) {
      await supabase.from('regression_risk_history').insert(historyRows);
    }

    // Persist coverage snapshots
    const coverageRows = report.coverageResults.map(c => ({
      report_id:       report.id,
      area_name:       c.areaName,
      coverage_score:  c.coverageScore,
      test_case_count: c.testCaseCount,
      covered:         c.covered,
      from_version:    report.fromVersion,
      to_version:      report.toVersion,
    }));
    if (coverageRows.length > 0) {
      await supabase.from('regression_coverage_snapshots').insert(coverageRows);
    }
  }
}

export const regressionAnalysisEngine = new RegressionAnalysisEngine();
