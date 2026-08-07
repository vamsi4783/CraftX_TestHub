// ─── CoverageAnalyzer (Phase 4 M9) ────────────────────────────────────────────
// Reads test cases + their steps from Supabase and maps them to impacted areas.
// Calculates per-area coverage scores.
//
// Schema truth (verified from migrations 002 + 007):
//   test_cases       → id, title, estimated_minutes, module_id
//   test_case_steps  → id, test_case_id, step_number, description,
//                      expected_result, automation_config JSONB
//   automation_config on test_case_steps → { driver_id, action, params: { value?, ... } }
//
// The previous implementation incorrectly queried automation_config on test_cases
// (that column does not exist on test_cases). This version joins test_case_steps.

import { supabase }       from '@/lib/supabase';
import type { ImpactedArea, CoverageResult } from './RegressionAnalysisTypes';

// ─── DB row shapes ─────────────────────────────────────────────────────────────

interface StepRow {
  id:                string;
  test_case_id:      string;
  step_number:       number;
  description:       string;
  expected_result:   string;
  automation_config?: {
    driver_id?: string;
    action?:    string;
    params?:    { value?: string; [k: string]: unknown };
  } | null;
}

interface TestCaseRow {
  id:                string;
  title:             string;
  estimated_minutes: number | null;
  steps:             StepRow[];
}

// ─── CoverageAnalyzer ─────────────────────────────────────────────────────────

export class CoverageAnalyzer {
  async analyze(impactedAreas: ImpactedArea[]): Promise<CoverageResult[]> {
    if (impactedAreas.length === 0) return [];

    // ── 1. Load all automation-ready test cases with their steps ──────────────
    //   Join test_case_steps via the foreign key relationship.
    //   Limit 500 test cases; warn if truncated.
    const { data: tcData, error: tcError } = await supabase
      .from('test_cases')
      .select(`
        id,
        title,
        estimated_minutes,
        test_case_steps ( id, test_case_id, step_number, description, expected_result, automation_config )
      `)
      .eq('is_automation_ready', true)
      .limit(500);

    if (tcError) throw new Error(`CoverageAnalyzer: ${tcError.message}`);

    if ((tcData?.length ?? 0) >= 500) {
      console.warn('CoverageAnalyzer: test case result truncated at 500. Coverage scoring may be incomplete for large projects.');
    }

    // Normalise the Supabase nested join (steps may come back as array or null)
    const testCases: TestCaseRow[] = (tcData ?? []).map(row => ({
      id:                (row as { id: string }).id,
      title:             (row as { title: string }).title,
      estimated_minutes: (row as { estimated_minutes: number | null }).estimated_minutes,
      steps: (Array.isArray((row as { test_case_steps: unknown }).test_case_steps)
        ? (row as { test_case_steps: StepRow[] }).test_case_steps
        : []) as StepRow[],
    }));

    // ── 2. Map each impacted area → matching test cases ───────────────────────
    const results: CoverageResult[] = impactedAreas.map(area => {
      const matching = testCases.filter(tc => this._touches(tc, area));

      // stepCount: actual steps from test_case_steps; fall back to estimated_minutes ÷ 2
      const stepCount = matching.reduce((sum, tc) => {
        const actual = tc.steps.length;
        if (actual > 0) return sum + actual;
        // estimated_minutes proxy: assume ~2 min per step
        return sum + Math.round((tc.estimated_minutes ?? 15) / 2);
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

  /** Returns true if this test case touches the given impacted area. */
  private _touches(tc: TestCaseRow, area: ImpactedArea): boolean {
    const titleLower = tc.title.toLowerCase();
    const areaLower  = area.name.toLowerCase();

    // ── Signal 1: area name substring match in test title ─────────────────────
    if (titleLower.includes(areaLower) || areaLower.includes(titleLower)) return true;

    // ── Signal 2: step description / expected_result mention area keywords ────
    const areaWords = areaLower.split(/\s+/).filter(w => w.length > 3);
    for (const step of tc.steps) {
      const descLower = step.description.toLowerCase();
      const expLower  = step.expected_result.toLowerCase();
      const valLower  = (step.automation_config?.params?.value ?? '').toLowerCase();
      const combined  = `${descLower} ${expLower} ${valLower}`;
      if (areaWords.some(w => combined.includes(w))) return true;
    }

    // ── Signal 3: file path segment keywords match step text ──────────────────
    const fileSegs = area.files.flatMap(f =>
      f.replace(/\\/g, '/').split('/').pop()
        ?.replace(/\.[^.]+$/, '')
        .toLowerCase()
        .split(/[-_]/) ?? [],
    ).filter(s => s.length > 3);

    if (fileSegs.length > 0) {
      for (const step of tc.steps) {
        const combined = `${step.description} ${step.expected_result}`.toLowerCase();
        if (fileSegs.some(seg => combined.includes(seg))) return true;
      }
    }

    return false;
  }

  private _computeScore(testCount: number, stepCount: number, riskFactor: number): number {
    if (testCount === 0) return 0;
    const base = Math.min(1, testCount * 0.25 + stepCount * 0.02);
    return Math.min(1, base / (0.5 + riskFactor * 0.5));
  }
}
