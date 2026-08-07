// ─── CoverageAnalyzer tests (Phase 4 M9 — BLOCKER-2 fix) ─────────────────────
// Verifies the corrected query: test_case_steps joined through test_cases,
// NOT automation_config on test_cases (that column does not exist on test_cases).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImpactedArea } from '../../services/regressionAnalysis/RegressionAnalysisTypes';

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockEq     = vi.fn();
const mockLimit  = vi.fn();
const mockFrom   = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}));

function buildChain(returnValue: { data: unknown[]; error: null | { message: string } }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    limit:  vi.fn().mockResolvedValue(returnValue),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeArea(name: string, files: string[] = []): ImpactedArea {
  return {
    id:           `area-${name}`,
    name,
    type:         'screen',
    files,
    category:     'screen_layout',
    directChange: true,
    riskFactor:   0.6,
  };
}

function makeTcRow(id: string, title: string, steps: Array<{
  description: string; expected_result: string; automation_config?: unknown;
}> = []) {
  return {
    id,
    title,
    estimated_minutes: 15,
    test_case_steps: steps.map((s, i) => ({
      id:               `step-${id}-${i}`,
      test_case_id:     id,
      step_number:      i + 1,
      description:      s.description,
      expected_result:  s.expected_result,
      automation_config: s.automation_config ?? null,
    })),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CoverageAnalyzer (BLOCKER-2 corrected)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Dynamic import to pick up mock ──────────────────────────────────────────
  async function getAnalyzer() {
    const { CoverageAnalyzer } = await import('../../services/regressionAnalysis/CoverageAnalyzer');
    return new CoverageAnalyzer();
  }

  it('returns empty results for empty impacted areas', async () => {
    const chain = buildChain({ data: [], error: null });
    const analyzer = await getAnalyzer();
    const results = await analyzer.analyze([]);
    expect(results).toEqual([]);
    // Should not query DB if no areas
    expect(chain.select).not.toHaveBeenCalled();
  });

  it('queries test_cases (not test_case_steps directly)', async () => {
    buildChain({ data: [], error: null });
    const analyzer = await getAnalyzer();
    await analyzer.analyze([makeArea('Login')]);
    expect(mockFrom).toHaveBeenCalledWith('test_cases');
  });

  it('selects test_case_steps via join (automation_config inside join, not top-level)', async () => {
    const chain = buildChain({ data: [], error: null });
    const analyzer = await getAnalyzer();
    await analyzer.analyze([makeArea('Login')]);
    const selectCall = chain.select.mock.calls[0][0] as string;
    // Must include the join syntax
    expect(selectCall).toContain('test_case_steps');
    // automation_config must appear inside test_case_steps(...), not as a bare top-level col
    const joinMatch = selectCall.match(/test_case_steps\s*\(([^)]+)\)/s);
    expect(joinMatch).not.toBeNull();
    expect(joinMatch![1]).toContain('automation_config');
    // No standalone top-level automation_config (not wrapped in a join)
    const topLevelCols = selectCall.split(/test_case_steps\s*\([^)]*\)/s)[0];
    expect(topLevelCols).not.toContain('automation_config');
  });

  it('filters by is_automation_ready = true', async () => {
    const chain = buildChain({ data: [], error: null });
    const analyzer = await getAnalyzer();
    await analyzer.analyze([makeArea('Login')]);
    expect(chain.eq).toHaveBeenCalledWith('is_automation_ready', true);
  });

  it('matches test case by title substring', async () => {
    buildChain({
      data: [makeTcRow('tc1', 'Login flow test')],
      error: null,
    });
    const analyzer = await getAnalyzer();
    const results = await analyzer.analyze([makeArea('Login')]);
    expect(results[0].testCaseCount).toBe(1);
    expect(results[0].covered).toBe(true);
    expect(results[0].testCaseIds).toContain('tc1');
  });

  it('does NOT match test case with unrelated title', async () => {
    buildChain({
      data: [makeTcRow('tc1', 'Payment checkout flow')],
      error: null,
    });
    const analyzer = await getAnalyzer();
    const results = await analyzer.analyze([makeArea('Login')]);
    expect(results[0].testCaseCount).toBe(0);
    expect(results[0].covered).toBe(false);
  });

  it('matches by step description keyword', async () => {
    buildChain({
      data: [makeTcRow('tc1', 'Navigation test', [
        { description: 'Tap the login button', expected_result: 'Login screen appears' },
      ])],
      error: null,
    });
    const analyzer = await getAnalyzer();
    const results = await analyzer.analyze([makeArea('Login')]);
    expect(results[0].covered).toBe(true);
  });

  it('matches by automation_config params.value', async () => {
    buildChain({
      data: [makeTcRow('tc1', 'Enter credentials', [
        {
          description: 'Type in the field',
          expected_result: 'Text appears',
          automation_config: { driver_id: 'android', action: 'type_text', params: { value: 'loginUser' } },
        },
      ])],
      error: null,
    });
    const analyzer = await getAnalyzer();
    const results = await analyzer.analyze([makeArea('LoginUser')]);
    expect(results[0].covered).toBe(true);
  });

  it('stepCount reflects actual test_case_steps count', async () => {
    buildChain({
      data: [makeTcRow('tc1', 'Login test', [
        { description: 'Launch app', expected_result: 'App opens' },
        { description: 'Tap login', expected_result: 'Login screen' },
        { description: 'Enter password', expected_result: 'Password accepted' },
      ])],
      error: null,
    });
    const analyzer = await getAnalyzer();
    const results = await analyzer.analyze([makeArea('Login')]);
    expect(results[0].stepCount).toBe(3); // 3 actual steps, not 0
  });

  it('stepCount falls back to estimated_minutes ÷ 2 when no steps', async () => {
    buildChain({
      data: [{ id: 'tc1', title: 'Login test', estimated_minutes: 20, test_case_steps: [] }],
      error: null,
    });
    const analyzer = await getAnalyzer();
    const results = await analyzer.analyze([makeArea('Login')]);
    // estimated_minutes=20 → 20/2=10 steps proxy, but tc matched via title
    expect(results[0].stepCount).toBe(10);
  });

  it('coverageScore is 0 for uncovered areas', async () => {
    buildChain({ data: [], error: null });
    const analyzer = await getAnalyzer();
    const results = await analyzer.analyze([makeArea('Checkout')]);
    expect(results[0].coverageScore).toBe(0);
    expect(results[0].covered).toBe(false);
  });

  it('coverageScore is in [0, 1] for covered areas', async () => {
    buildChain({
      data: [makeTcRow('tc1', 'Checkout test', [
        { description: 'Open checkout', expected_result: 'Checkout opens' },
        { description: 'Add item', expected_result: 'Item added' },
      ])],
      error: null,
    });
    const analyzer = await getAnalyzer();
    const results = await analyzer.analyze([makeArea('Checkout')]);
    expect(results[0].coverageScore).toBeGreaterThan(0);
    expect(results[0].coverageScore).toBeLessThanOrEqual(1);
  });

  it('handles multiple areas correctly', async () => {
    buildChain({
      data: [
        makeTcRow('tc1', 'Login test'),
        makeTcRow('tc2', 'Checkout flow', [
          { description: 'Go to checkout', expected_result: 'Checkout screen' },
        ]),
      ],
      error: null,
    });
    const analyzer = await getAnalyzer();
    const areas = [makeArea('Login'), makeArea('Checkout'), makeArea('Profile')];
    const results = await analyzer.analyze(areas);
    expect(results).toHaveLength(3);
    expect(results.find(r => r.areaName === 'Login')?.covered).toBe(true);
    expect(results.find(r => r.areaName === 'Checkout')?.covered).toBe(true);
    expect(results.find(r => r.areaName === 'Profile')?.covered).toBe(false);
  });

  it('throws on Supabase error', async () => {
    buildChain({ data: [], error: { message: 'connection refused' } });
    const analyzer = await getAnalyzer();
    await expect(analyzer.analyze([makeArea('Login')])).rejects.toThrow('CoverageAnalyzer');
  });
});
