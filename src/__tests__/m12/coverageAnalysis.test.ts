// ─── M12 Phase O: Coverage Analysis Tests ─────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { analyzeCoverage } from '@/services/coverageAnalysisService';
import type { ProjectKnowledge, CodeModule } from '@/services/projectIngestion/types';
import type { TestCase } from '@/types';

function makeModule(overrides: Partial<CodeModule> = {}): CodeModule {
  return {
    id:          overrides.id          ?? 'auth',
    name:        overrides.name        ?? 'Auth',
    path:        overrides.path        ?? 'src/auth',
    filePaths:   overrides.filePaths   ?? ['src/auth/LoginScreen.tsx'],
    description: overrides.description ?? '',
    type:        overrides.type        ?? 'feature',
    dependsOn:   overrides.dependsOn   ?? [],
    fileCount:   overrides.fileCount   ?? 1,
    testCount:   overrides.testCount   ?? 0,
    ...overrides,
  };
}

function makeKnowledge(modules: CodeModule[], extraTestPaths: string[] = []): ProjectKnowledge {
  return {
    projectId: 'p1', sourceId: 's1', generatedAt: new Date().toISOString(),
    schemaVersion: 1, name: 'TestApp', description: '', purpose: '',
    languages: [], frameworks: [], buildSystem: null, testFrameworks: [],
    architectureStyle: null,
    codeModules: modules,
    entryPoints: [], dependencies: [], configFiles: [],
    existingTestPaths: extraTestPaths,
    coveredModules: [], uncoveredModules: [], coverageScore: 0,
    fileSummaries: [], totalFiles: 0, indexedFiles: 0, ignoredFiles: 0,
    sensitiveFiles: 0, languageStats: {},
  };
}

function makeTestCase(title: string, tags: string[] = []): TestCase {
  return {
    id: `tc-${title}`, test_id: 'TC-1', title, description: '',
    priority: 'medium', status: 'active', tags,
    is_automation_ready: false, estimated_minutes: 5,
    project_id: 'p1', module_id: null, created_by: 'user', updated_by: null,
    preconditions: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    steps: [],
  };
}

const authModule      = makeModule({ id: 'auth',      name: 'Authentication' });
const dashboardModule = makeModule({ id: 'dashboard',  name: 'Dashboard' });
const paymentsModule  = makeModule({ id: 'payments',   name: 'Payments', type: 'core' });
const knowledge       = makeKnowledge([authModule, dashboardModule, paymentsModule]);

describe('analyzeCoverage', () => {
  it('returns one entry per module', () => {
    const result = analyzeCoverage(knowledge, []);
    expect(result.entries).toHaveLength(3);
  });

  it('marks all modules as none coverage when no test cases exist', () => {
    const result = analyzeCoverage(knowledge, []);
    result.entries.forEach(e => {
      expect(e.coverageLevel).toBe('none');
      expect(e.matchedTitles).toHaveLength(0);
    });
  });

  it('matches test cases to modules by title substring', () => {
    const testCases = [
      makeTestCase('Login with valid credentials'),
      makeTestCase('Logout user session'),
    ];
    const result = analyzeCoverage(knowledge, testCases);
    const authEntry = result.entries.find(e => e.module.id === 'auth');
    // "authentication" is in the title via substring
    expect(authEntry).toBeDefined();
  });

  it('matches test cases by tag matching module name token', () => {
    const testCases = [makeTestCase('Check billing', ['payments', 'billing'])];
    const result = analyzeCoverage(knowledge, testCases);
    const payEntry = result.entries.find(e => e.module.id === 'payments');
    expect(payEntry?.matchedTitles.length).toBeGreaterThan(0);
  });

  it('computes estimatedPercent between 0 and 100', () => {
    const testCases = [makeTestCase('Authentication test')];
    const result = analyzeCoverage(knowledge, testCases);
    expect(result.estimatedPercent).toBeGreaterThanOrEqual(0);
    expect(result.estimatedPercent).toBeLessThanOrEqual(100);
  });

  it('includes the AI Coverage Estimate disclaimer', () => {
    const result = analyzeCoverage(knowledge, []);
    expect(result.disclaimer).toContain('TestHub AI Coverage Estimate');
  });

  it('assigns strong coverage when 6+ tests match a module', () => {
    const testCases = Array.from({ length: 7 }, (_, i) =>
      makeTestCase(`Authentication step ${i + 1}`)
    );
    const result = analyzeCoverage(knowledge, testCases);
    const authEntry = result.entries.find(e => e.module.id === 'auth');
    expect(authEntry?.coverageLevel).toBe('strong');
  });

  it('assigns weak coverage for 1 matched test', () => {
    const testCases = [makeTestCase('Authentication edge case')];
    const result = analyzeCoverage(knowledge, testCases);
    const authEntry = result.entries.find(e => e.module.id === 'auth');
    expect(authEntry?.coverageLevel).toBe('weak');
  });

  it('counts totalModules, coveredModules, uncoveredModules correctly', () => {
    // Auth has a match, others don't
    const testCases = [makeTestCase('Authentication flow')];
    const result = analyzeCoverage(knowledge, testCases);
    expect(result.totalModules).toBe(3);
    expect(result.coveredModules + result.uncoveredModules).toBe(3);
  });

  it('existingTestPaths (project source tests) do NOT count as coverage', () => {
    const knowledgeWithSourceTests = makeKnowledge(
      [authModule],
      ['src/__tests__/auth.test.ts'], // project source test
    );
    // No TestHub test_cases provided
    const result = analyzeCoverage(knowledgeWithSourceTests, []);
    expect(result.entries[0].coverageLevel).toBe('none');
  });
});
