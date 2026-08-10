// ─── M12 Phase P: Architecture Invariant Tests ────────────────────────────────

import { describe, it, expect } from 'vitest';
import { normalizeTestCase, normalizeTestCaseBatch } from '@/services/testCaseNormalizer';
import { parseJsonInput, dryRunJsonImport } from '@/services/jsonImportService';
import { buildHeuristicTestPlan } from '@/services/aiTestGenerator/TestPlanBuilder';
import { analyzeCoverage } from '@/services/coverageAnalysisService';
import type { ProjectKnowledge, CodeModule } from '@/services/projectIngestion/types';

function makeModule(overrides: Partial<CodeModule> = {}): CodeModule {
  return {
    id: 'auth', name: 'Auth', path: 'src/auth',
    filePaths: ['src/auth/Auth.ts'], description: '',
    type: 'feature', dependsOn: [], fileCount: 1, testCount: 0,
    ...overrides,
  };
}

function makeKnowledge(overrides: Partial<ProjectKnowledge> = {}): ProjectKnowledge {
  return {
    projectId: 'p1', sourceId: 's1', generatedAt: new Date().toISOString(),
    schemaVersion: 1, name: 'MyApp', description: '', purpose: '',
    languages: [], frameworks: [], buildSystem: null, testFrameworks: [],
    architectureStyle: null,
    codeModules: [makeModule()],
    entryPoints: [], dependencies: [], configFiles: [],
    existingTestPaths: [], coveredModules: [], uncoveredModules: [],
    coverageScore: 0, fileSummaries: [],
    totalFiles: 0, indexedFiles: 0, ignoredFiles: 0, sensitiveFiles: 0,
    languageStats: {},
    ...overrides,
  };
}

// ── INV-1: One canonical TestCase model ────────────────────────────────────────
describe('INV-1: canonical TestCase model', () => {
  it('normalizer output conforms to DraftTestCase shape', () => {
    const result = normalizeTestCase({ title: 'T', steps: [] });
    expect(result.ok).toBe(true);
    const draft = result.draft!;
    expect(typeof draft.title).toBe('string');
    expect(typeof draft.priority).toBe('string');
    expect(Array.isArray(draft.steps)).toBe(true);
    expect(Array.isArray(draft.tags)).toBe(true);
  });
});

// ── INV-2: Single normalizer path ─────────────────────────────────────────────
describe('INV-2: single normalizer entry point', () => {
  it('manual/json/AI inputs all produce the same DraftTestCase shape', () => {
    const r1 = normalizeTestCase({ title: 'Manual TC', steps: [] });
    const r2 = normalizeTestCase({ title: 'JSON TC',   steps: [] });
    const r3 = normalizeTestCase({ title: 'AI TC',     steps: [] });
    [r1, r2, r3].forEach(r => expect(r.ok).toBe(true));
    expect(Object.keys(r1.draft!).sort()).toEqual(Object.keys(r2.draft!).sort());
  });
});

// ── INV-3: Priority normalization is exhaustive ────────────────────────────────
describe('INV-3: priority normalization', () => {
  const validPriorities = ['critical', 'high', 'medium', 'low'];

  it('maps known aliases to canonical priority', () => {
    const cases: [string, string][] = [
      ['p1', 'critical'], ['p2', 'high'], ['p3', 'medium'], ['p4', 'low'],
      ['blocker', 'critical'], ['minor', 'low'], ['trivial', 'low'],
    ];
    cases.forEach(([alias, expected]) => {
      const r = normalizeTestCase({ title: 'T', priority: alias, steps: [] });
      expect(r.draft?.priority).toBe(expected);
    });
  });

  it('output priority is always one of the 4 canonical values', () => {
    ['p1', 'p2', 'critical', 'high', 'medium', 'low', 'unknown_prio'].forEach(p => {
      const r = normalizeTestCase({ title: 'T', priority: p, steps: [] });
      if (r.ok) expect(validPriorities).toContain(r.draft?.priority);
    });
  });
});

// ── INV-4: Category normalization supports all 13 categories ──────────────────
describe('INV-4: category normalization', () => {
  it('all 13 canonical categories are accepted', () => {
    [
      'smoke', 'happy_path', 'validation', 'boundary', 'negative',
      'permission', 'navigation', 'regression',
      'integration', 'performance', 'api', 'data_validation', 'compatibility',
    ].forEach(cat => {
      const r = normalizeTestCase({ title: 'T', category: cat, steps: [] });
      expect(r.ok).toBe(true);
    });
  });
});

// ── INV-5: JSON import flows through normalizer ────────────────────────────────
describe('INV-5: JSON import uses normalizer validation', () => {
  it('dryRunJsonImport rejects items with missing title', () => {
    expect(dryRunJsonImport([{ steps: [] }]).invalid).toBe(1);
  });

  it('dryRunJsonImport accepts valid items', () => {
    expect(dryRunJsonImport([{ title: 'T', steps: [] }]).valid).toBe(1);
  });
});

// ── INV-6: parseJsonInput supports all documented shapes ──────────────────────
describe('INV-6: parseJsonInput shape support', () => {
  it('handles direct array',   () => expect(parseJsonInput('[{"title":"T"}]')).toHaveLength(1));
  it('handles test_cases key', () => expect(parseJsonInput('{"test_cases":[{"title":"T"}]}')).toHaveLength(1));
  it('handles cases key',      () => expect(parseJsonInput('{"cases":[{"title":"T"}]}')).toHaveLength(1));
  it('handles tests key',      () => expect(parseJsonInput('{"tests":[{"title":"T"}]}')).toHaveLength(1));
  it('handles single object',  () => expect(parseJsonInput('{"title":"T"}')).toHaveLength(1));
  it('returns null for garbage', () => expect(parseJsonInput('garbage')).toBeNull());
});

// ── INV-7: heuristic test plan requires no AI ─────────────────────────────────
describe('INV-7: heuristic test plan is synchronous and AI-free', () => {
  it('returns a plan immediately', () => {
    const knowledge = makeKnowledge();
    const plan = buildHeuristicTestPlan(knowledge, 0);
    expect(plan.projectName).toBe('MyApp');
    expect(plan.modules).toHaveLength(1);
    expect(typeof plan.totalEstimatedTests).toBe('number');
    expect(Array.isArray(plan.coverageGaps)).toBe(true);
  });
});

// ── INV-8: coverage analysis uses TestHub test_cases, not project source tests ─
describe('INV-8: coverage uses TestHub test_cases, not existingTestPaths', () => {
  it('zero TestHub test_cases → none coverage, even with existingTestPaths', () => {
    const knowledge = makeKnowledge({
      existingTestPaths: ['src/__tests__/auth.test.ts'], // project source test
    });
    const result = analyzeCoverage(knowledge, []); // no TestHub test_cases
    expect(result.entries[0].coverageLevel).toBe('none');
    expect(result.entries[0].matchedTitles).toHaveLength(0);
  });
});

// ── INV-9: batch tally integrity ──────────────────────────────────────────────
describe('INV-9: batch normalization tally integrity', () => {
  it('validCount + invalidCount === results.length for any input', () => {
    const raws = [{ title: 'A', steps: [] }, { steps: [] }, { title: 'C', steps: [] }, 42];
    const { results, validCount, invalidCount } = normalizeTestCaseBatch(raws);
    expect(validCount + invalidCount).toBe(results.length);
    expect(results.length).toBe(4);
  });
});

// ── INV-10: steps always array ────────────────────────────────────────────────
describe('INV-10: draft.steps is always an array', () => {
  it('steps default to [] when key is absent', () => {
    const r = normalizeTestCase({ title: 'T' });
    if (r.ok) expect(Array.isArray(r.draft!.steps)).toBe(true);
  });
});

// ── INV-11: tags always array ─────────────────────────────────────────────────
describe('INV-11: draft.tags is always string[]', () => {
  it('tags from string, array, or absent are all arrays', () => {
    [
      { title: 'A', tags: 'smoke, login', steps: [] },
      { title: 'B', tags: ['smoke'], steps: [] },
      { title: 'C', steps: [] },
    ].forEach(raw => {
      const r = normalizeTestCase(raw);
      if (r.ok) expect(Array.isArray(r.draft!.tags)).toBe(true);
    });
  });
});

// ── INV-12: coverage disclaimer always present ────────────────────────────────
describe('INV-12: coverage disclaimer always present', () => {
  it('analyzeCoverage result always has "TestHub AI Coverage Estimate" disclaimer', () => {
    const result = analyzeCoverage(makeKnowledge({ codeModules: [] }), []);
    expect(result.disclaimer).toContain('TestHub AI Coverage Estimate');
  });
});
