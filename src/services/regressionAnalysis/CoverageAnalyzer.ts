// ─── CoverageAnalyzer (Phase 4 M9) ────────────────────────────────────────────
// Reads test cases from Supabase and maps them to impacted areas.
// Calculates per-area coverage scores.

import { supabase }       from '@/lib/supabase';
import type { ImpactedArea, CoverageResult } from './RegressionAnalysisTypes';

interface TestCaseRow {
  id:            string;
  title:         string;
  automation_config?: {
    steps?: Array<{ selector?: string; action?: string; params?: Record<string, unknown> }>;
  } | null;
  module?: { name: string } | null;
}

export class CoverageAnalyzer {
  async analyze(impactedAreas: ImpactedArea[]): Promise<CoverageResult[]> {
    // ── Load test cases with automation steps ────────────────────────────────
    const { data, error } = await supabase
      .from('test_cases')
      .select('id, title, automation_config, modules(name)')
      .not('automation_config', 'is', null)
      .limit(500);

    if (error) throw new Error(`CoverageAnalyzer: ${error.message}`);

    const testCases = (data ?? []) as unknown as TestCaseRow[];

    // ── Map: area → test cases that touch it ──────────────────────────────────
    const results: CoverageResult[] = impactedAreas.map(area => {
      const matching = testCases.filter(tc => this._touches(tc, area));

      const stepCount = matching.reduce((sum, tc) => {
        return sum + (tc.automation_config?.steps?.length ?? 0);
      }, 0);

      const coverageScore = this._computeScore(matching.length, stepCount, area.riskFactor);

      return {
        areaId:        area.id,
        areaName:      area.name,
        testCaseCount: matching.length,
        stepCount,
        covered:       matching.length > 0,
        coverageScore,
        testCaseIds:   matching.map(tc => tc.id),
      };
    });

    return results;
  }

  private _touches(tc: TestCaseRow, area: ImpactedArea): boolean {
    const steps = tc.automation_config?.steps ?? [];
    const titleLower = tc.title.toLowerCase();
    const areaLower  = area.name.toLowerCase();

    // Match by area name in test title
    if (titleLower.includes(areaLower) || areaLower.includes(titleLower)) return true;

    // Match by selector/action referencing area-related strings
    for (const step of steps) {
      const sel    = (step.selector ?? '').toLowerCase();
      const action = (step.action   ?? '').toLowerCase();
      const areaWords = areaLower.split(/\s+/);
      if (areaWords.some(w => w.length > 3 && (sel.includes(w) || action.includes(w)))) {
        return true;
      }
    }

    // Match by file path segment in selector
    const fileSegs = area.files.flatMap(f =>
      f.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '').toLowerCase().split(/[-_]/) ?? [],
    ).filter(s => s.length > 3);

    for (const step of steps) {
      const sel = (step.selector ?? '').toLowerCase();
      if (fileSegs.some(seg => sel.includes(seg))) return true;
    }

    return false;
  }

  private _computeScore(testCount: number, stepCount: number, riskFactor: number): number {
    if (testCount === 0) return 0;
    // More steps = more thorough coverage; normalize against risk
    const base = Math.min(1, testCount * 0.25 + stepCount * 0.02);
    // High-risk areas need more coverage to be considered "well covered"
    return Math.min(1, base / (0.5 + riskFactor * 0.5));
  }
}
