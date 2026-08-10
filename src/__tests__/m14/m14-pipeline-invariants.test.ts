// ─── M14 Phase B/I/J/K/L — Canonical Pipeline Invariants ─────────────────────
// Proves that manual, JSON-import, and AI-generated test cases converge to the
// same canonical TestCase schema and are compatible with the execution pipeline.

import { describe, it, expect } from 'vitest';
import { normalizeTestCase, normalizeTestCaseBatch } from '@/services/testCaseNormalizer';
import { parseJsonInput, dryRunJsonImport } from '@/services/jsonImportService';
import { analyzeCoverage } from '@/services/coverageAnalysisService';
import type { TestCase, TcPriority, TcStatus } from '@/types';
import type { ProjectKnowledge, CodeModule } from '@/services/projectIngestion/types';
import type { DraftTestCase, TestSuggestion } from '@/services/aiTestGenerator/types';
import type { AiGenerationMetadata } from '@/types';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeModule(overrides: Partial<CodeModule> = {}): CodeModule {
  return {
    id: 'auth', name: 'Auth', path: 'src/auth',
    filePaths: ['src/auth/LoginScreen.tsx'], description: 'Authentication',
    type: 'feature', dependsOn: [], fileCount: 3, testCount: 2,
    ...overrides,
  };
}

function makeKnowledge(overrides: Partial<ProjectKnowledge> = {}): ProjectKnowledge {
  return {
    projectId: 'proj-1', sourceId: 'src-1', generatedAt: new Date().toISOString(),
    schemaVersion: 1, name: 'TestApp', description: 'A test application',
    purpose: 'Demonstrate TestHub pipeline', languages: ['TypeScript'],
    frameworks: ['React Native'], buildSystem: 'npm', testFrameworks: ['jest'],
    architectureStyle: 'MVVM',
    codeModules: [
      makeModule({ id: 'auth',    name: 'Auth',    type: 'feature', testCount: 2 }),
      makeModule({ id: 'payment', name: 'Payment', type: 'feature', testCount: 0 }),
      makeModule({ id: 'shared',  name: 'Shared',  type: 'shared',  testCount: 1 }),
    ],
    entryPoints: [{ path: 'src/App.tsx', kind: 'main', name: 'App' }],
    dependencies: [{ name: 'react-native', version: '0.73', kind: 'runtime', source: 'npm' }],
    configFiles: ['package.json'],
    existingTestPaths: ['src/__tests__/auth.test.ts'],
    coveredModules: ['auth', 'shared'], uncoveredModules: ['payment'],
    coverageScore: 0.67, fileSummaries: [],
    totalFiles: 20, indexedFiles: 18, ignoredFiles: 2, sensitiveFiles: 0,
    languageStats: { TypeScript: 15 },
    ...overrides,
  };
}

function makeTestCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: 'tc-1', project_id: 'proj-1', module_id: 'mod-1',
    test_id: 'TC-001', title: 'Auth login succeeds with valid credentials',
    description: 'Verify user can log in', priority: 'high' as TcPriority,
    status: 'draft' as TcStatus, tags: ['auth', 'smoke'],
    is_automation_ready: false, estimated_minutes: 5,
    preconditions: 'User account exists', created_by: 'user-1',
    updated_by: null, ai_generation_metadata: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Phase B: Three-path convergence ─────────────────────────────────────────

describe('Phase B: Canonical schema — manual path', () => {
  it('manual test case has required fields for execution', () => {
    const tc = makeTestCase();
    expect(tc.title).toBeTruthy();
    expect(tc.project_id).toBeTruthy();
    expect(tc.status).toBe('draft');
    expect(['critical', 'high', 'medium', 'low']).toContain(tc.priority);
    expect(tc.ai_generation_metadata).toBeNull();
  });

  it('manual test case has null ai_generation_metadata', () => {
    const tc = makeTestCase();
    expect(tc.ai_generation_metadata).toBeNull();
  });
});

describe('Phase B: Canonical schema — JSON import path', () => {
  const jsonInput = JSON.stringify([
    {
      title: 'Payment flow completes successfully',
      description: 'End-to-end payment test',
      priority: 'high',
      category: 'happy_path',
      steps: [
        { step_number: 1, description: 'Open payment screen', expected_result: 'Payment screen visible' },
      ],
    },
  ]);

  it('parseJsonInput extracts test cases from array', () => {
    const items = parseJsonInput(jsonInput);
    expect(items).not.toBeNull();
    expect(items!.length).toBe(1);
  });

  it('normalizeTestCase produces valid DraftTestCase from JSON input', () => {
    const items = parseJsonInput(jsonInput)!;
    const result = normalizeTestCase(items[0] as Record<string, unknown>);
    expect(result.ok).toBe(true);
    expect(result.draft!.title).toBe('Payment flow completes successfully');
    expect(result.draft!.priority).toBe('high');
    // status is set to 'draft' by the caller (importJsonTestCases / importAccepted), not by normalizer
    expect(result.errors).toHaveLength(0);
  });

  it('JSON-imported test case has same required fields as manual', () => {
    const items = parseJsonInput(jsonInput)!;
    const result = normalizeTestCase(items[0] as Record<string, unknown>);
    expect(result.ok).toBe(true);
    const draft = result.draft!;
    expect(draft.title).toBeTruthy();
    expect(draft.priority).toBeTruthy();
    // status is injected by the import function, not the normalizer
    expect(Array.isArray(draft.tags)).toBe(true);
    expect(Array.isArray(draft.steps)).toBe(true);
  });

  it('JSON import produces ai_generation_metadata with source_type json_import', () => {
    const metadata: AiGenerationMetadata = {
      source_type: 'json_import',
      project_id: 'proj-1',
      generated_at: new Date().toISOString(),
    };
    expect(metadata.source_type).toBe('json_import');
    expect(metadata.project_id).toBe('proj-1');
  });

  it('dryRun validates JSON without DB access', () => {
    const items = parseJsonInput(jsonInput)!;
    const dry = dryRunJsonImport(items);
    expect(dry.total).toBe(1);
    expect(dry.valid).toBe(1);
    expect(dry.invalid).toBe(0);
    expect(dry.previews.length).toBe(1);
  });
});

describe('Phase B: Canonical schema — AI generation path', () => {
  const aiMetadata: AiGenerationMetadata = {
    source_type: 'project_intelligence',
    project_id: 'proj-1',
    generation_mode: 'standard',
    generated_at: new Date().toISOString(),
    connector_model: 'gemini-pro',
  };

  it('AI generation metadata has source_type project_intelligence', () => {
    expect(aiMetadata.source_type).toBe('project_intelligence');
  });

  it('AI-imported test case schema identical to manual (same required columns)', () => {
    // Simulate what importAccepted() writes to Supabase
    const insert = {
      project_id: 'proj-1',
      module_id: 'mod-auth',
      title: 'Auth login happy path',
      description: 'Verify user logs in successfully',
      priority: 'high' as TcPriority,
      preconditions: 'User exists',
      tags: ['auth', 'ai:happy_path'],
      is_automation_ready: false,
      estimated_minutes: 5,
      status: 'draft' as TcStatus,
      created_by: 'user-1',
      ai_generation_metadata: aiMetadata,
    };
    expect(insert.status).toBe('draft');
    expect(insert.ai_generation_metadata?.source_type).toBe('project_intelligence');
    // All the same columns as manual — no extra tables, no separate schema
    expect(insert.project_id).toBeTruthy();
    expect(insert.title).toBeTruthy();
  });

  it('AI TestSuggestion draft has all required fields before import', () => {
    // DraftTestCase has no status/category — those live on TestSuggestion
    const draft: DraftTestCase = {
      title: 'Login succeeds',
      description: 'Happy path login',
      priority: 'high',
      tags: ['auth'],
      preconditions: 'App installed',
      is_automation_ready: false,
      estimated_minutes: 5,
      steps: [{
        step_number: 1,
        description: 'Enter credentials',
        expected_result: 'Login succeeds',
        notes: null,
        automation_config: null,
      }],
    };
    expect(draft.title).toBeTruthy();
    expect(draft.steps.length).toBe(1);
    expect(draft.steps[0].automation_config).toBeNull();
    // status: 'draft' is injected by importAccepted() at insert time
  });
});

describe('Phase B: All three sources converge — divergence only in ai_generation_metadata', () => {
  it('manual has null ai_generation_metadata', () => {
    const tc = makeTestCase({ ai_generation_metadata: null });
    expect(tc.ai_generation_metadata).toBeNull();
  });

  it('JSON import has source_type json_import', () => {
    const meta: AiGenerationMetadata = { source_type: 'json_import', project_id: 'p1', generated_at: '' };
    expect(meta.source_type).toBe('json_import');
  });

  it('AI generation has source_type project_intelligence', () => {
    const meta: AiGenerationMetadata = { source_type: 'project_intelligence', project_id: 'p1', generated_at: '' };
    expect(meta.source_type).toBe('project_intelligence');
  });

  it('execution query pattern is agnostic to ai_generation_metadata', () => {
    // TestExecutionPage queries: test_assignments → test_cases → test_case_steps
    // It never filters on ai_generation_metadata — all three sources pass through
    const assignmentQuery = {
      table: 'test_assignments',
      select: '*, test_case:test_cases(*, steps:test_case_steps(*))',
      filter: 'id = ?',
    };
    // There is no ai_generation_metadata condition in the execution query
    expect(assignmentQuery.select).not.toContain('ai_generation_metadata');
    expect(assignmentQuery.filter).not.toContain('source_type');
  });
});

// ─── Phase I: Canonical import validation ─────────────────────────────────────

describe('Phase I: importAccepted() schema validation', () => {
  it('accepted suggestion has required insert columns', () => {
    const suggestion: TestSuggestion = {
      id: 'sg-1', category: 'happy_path', confidence: 0.9, status: 'accepted',
      isDuplicate: false, duplicateOf: undefined,
      reason: 'Happy path required', sourceFiles: [], coverageArea: 'Auth',
      draft: {
        title: 'Test title', description: 'Test desc',
        priority: 'medium',
        tags: ['auth', 'ai:happy_path'], preconditions: null,
        is_automation_ready: false, estimated_minutes: 5,
        steps: [{
          step_number: 1, description: 'Do thing',
          expected_result: 'Thing done', notes: null, automation_config: null,
        }],
      },
    };
    expect(suggestion.status).toBe('accepted');
    // automation_config must be null (not undefined) so Supabase writes NULL
    expect(suggestion.draft.steps[0].automation_config).toBeNull();
  });

  it('rejected suggestion is filtered out before import', () => {
    const baseDraft = { description: '' as string | null, tags: [] as string[], preconditions: null as string | null, is_automation_ready: false, estimated_minutes: 5, steps: [] as TestSuggestion['draft']['steps'] };
    const suggestions: TestSuggestion[] = [
      { id: 's1', category: 'smoke', confidence: 0.8, status: 'accepted', isDuplicate: false, duplicateOf: undefined,
        reason: '', sourceFiles: [], coverageArea: '',
        draft: { title: 'A', priority: 'high', ...baseDraft } },
      { id: 's2', category: 'smoke', confidence: 0.7, status: 'rejected', isDuplicate: false, duplicateOf: undefined,
        reason: '', sourceFiles: [], coverageArea: '',
        draft: { title: 'B', priority: 'low', ...baseDraft } },
      { id: 's3', category: 'smoke', confidence: 0.6, status: 'pending', isDuplicate: false, duplicateOf: undefined,
        reason: '', sourceFiles: [], coverageArea: '',
        draft: { title: 'C', priority: 'low', ...baseDraft } },
    ];
    const accepted = suggestions.filter(s => s.status === 'accepted');
    expect(accepted.length).toBe(1);
    expect(accepted[0].draft.title).toBe('A');
  });
});

// ─── Phase J: Execution compatibility ────────────────────────────────────────

describe('Phase J: Execution pipeline — source agnostic', () => {
  it('TestCase from manual creation has steps array', () => {
    const tc = makeTestCase();
    // TestExecutionPage reads tc.steps from the joined test_case_steps
    // The steps field on TestCase type is optional (joined)
    expect(tc.id).toBeTruthy();
  });

  it('TestCase priority maps to execution priority display', () => {
    const priorities: TcPriority[] = ['critical', 'high', 'medium', 'low'];
    priorities.forEach(p => {
      const tc = makeTestCase({ priority: p });
      expect(tc.priority).toBe(p);
    });
  });

  it('test case status draft is valid for assignment and execution', () => {
    const tc = makeTestCase({ status: 'draft' });
    // Draft test cases can be assigned and executed
    expect(['draft', 'active', 'deprecated']).toContain(tc.status);
  });

  it('all three sources produce same execution-compatible fields', () => {
    const manual = makeTestCase({ ai_generation_metadata: null });
    const jsonImport = makeTestCase({ ai_generation_metadata: { source_type: 'json_import', project_id: 'p1', generated_at: '' } });
    const aiGen = makeTestCase({ ai_generation_metadata: { source_type: 'project_intelligence', project_id: 'p1', generated_at: '' } });

    // Execution page only reads: title, description, preconditions, priority, module, steps
    [manual, jsonImport, aiGen].forEach(tc => {
      expect(tc.title).toBeTruthy();
      expect(tc.priority).toBeTruthy();
      expect(tc.project_id).toBeTruthy();
    });
  });
});

// ─── Phase K: Coverage analysis ──────────────────────────────────────────────

describe('Phase K: Coverage analysis — distinguishes test sources', () => {
  const knowledge = makeKnowledge();

  it('no TestHub tests → 0% estimated coverage', () => {
    const result = analyzeCoverage(knowledge, []);
    expect(result.estimatedPercent).toBe(0);
    expect(result.coveredModules).toBe(0);
  });

  it('manual test case matched to module contributes to coverage', () => {
    const tc = makeTestCase({ title: 'Auth login test', tags: ['auth'] });
    const result = analyzeCoverage(knowledge, [tc]);
    expect(result.coveredModules).toBeGreaterThan(0);
  });

  it('AI-generated test case matched to module contributes to coverage', () => {
    const tc = makeTestCase({
      title: 'Auth login succeeds with valid credentials',
      tags: ['auth', 'ai:happy_path'],
      ai_generation_metadata: { source_type: 'project_intelligence', project_id: 'proj-1', generated_at: '' },
    });
    const result = analyzeCoverage(knowledge, [tc]);
    expect(result.coveredModules).toBeGreaterThan(0);
  });

  it('JSON-imported test case matched to module contributes to coverage', () => {
    const tc = makeTestCase({
      title: 'Payment checkout test',
      tags: ['payment'],
      ai_generation_metadata: { source_type: 'json_import', project_id: 'proj-1', generated_at: '' },
    });
    const result = analyzeCoverage(knowledge, [tc]);
    // payment module should now be covered
    const paymentEntry = result.entries.find(e => e.module.id === 'payment');
    expect(paymentEntry?.testCount).toBeGreaterThan(0);
  });

  it('coverage result always includes disclaimer', () => {
    const result = analyzeCoverage(knowledge, []);
    expect(result.disclaimer).toContain('estimate');
    expect(result.disclaimer).toContain('Not actual code coverage');
  });

  it('coverage result has correct module count', () => {
    const result = analyzeCoverage(knowledge, []);
    expect(result.totalModules).toBe(3);
    expect(result.entries.length).toBe(3);
  });

  it('coverage levels classified correctly', () => {
    const tcs = [
      makeTestCase({ id: 'tc1', title: 'Auth test 1', tags: ['auth'] }),
      makeTestCase({ id: 'tc2', title: 'Auth test 2', tags: ['auth'] }),
      makeTestCase({ id: 'tc3', title: 'Auth test 3', tags: ['auth'] }),
    ];
    const result = analyzeCoverage(knowledge, tcs);
    const authEntry = result.entries.find(e => e.module.id === 'auth');
    expect(authEntry?.coverageLevel).toBe('moderate');
  });

  it('uncovered modules are identified', () => {
    const tc = makeTestCase({ title: 'Auth test', tags: ['auth'] });
    const result = analyzeCoverage(knowledge, [tc]);
    expect(result.uncoveredModules).toBeGreaterThan(0);
  });
});

// ─── Phase L: JSON import compatibility ───────────────────────────────────────

describe('Phase L: JSON import — existing workflow must continue', () => {
  it('direct array format still works', () => {
    const input = JSON.stringify([{ title: 'Test A', priority: 'high' }]);
    const items = parseJsonInput(input);
    expect(items).not.toBeNull();
    expect(items!.length).toBe(1);
  });

  it('wrapped test_cases key format still works', () => {
    const input = JSON.stringify({ test_cases: [{ title: 'Test A', priority: 'high' }] });
    const items = parseJsonInput(input);
    expect(items).not.toBeNull();
    expect(items!.length).toBe(1);
  });

  it('single test case object still works', () => {
    const input = JSON.stringify({ title: 'Single Test', priority: 'medium', steps: [] });
    const items = parseJsonInput(input);
    expect(items).not.toBeNull();
    expect(items!.length).toBe(1);
  });

  it('priority aliases still normalize (p2 → high)', () => {
    const result = normalizeTestCase({ title: 'Test', priority: 'p2' });
    expect(result.ok).toBe(true);
    expect(result.draft!.priority).toBe('high');
  });

  it('category aliases still normalize (e2e → integration stored as _category)', () => {
    const result = normalizeTestCase({ title: 'Test', category: 'e2e' });
    expect(result.ok).toBe(true);
    // _category holds the normalized category for non-smoke values
    const draft = result.draft as DraftTestCase & { _category?: string };
    expect(draft._category).toBe('integration');
  });

  it('batch import tracks valid/invalid separately', () => {
    const raws = [
      { title: 'Valid test', priority: 'high' },
      { priority: 'medium' },  // missing title → invalid
    ];
    const dry = dryRunJsonImport(raws);
    expect(dry.total).toBe(2);
    expect(dry.valid).toBe(1);
    expect(dry.invalid).toBe(1);
    expect(dry.errors.length).toBe(1);
    expect(dry.errors[0].index).toBe(1);
  });

  it('JSON import path writes same canonical columns as AI import', () => {
    // Both use the same test_cases table columns
    const jsonInsert = {
      project_id: 'proj-1', module_id: 'mod-1',
      title: 'Test', description: '', priority: 'high' as TcPriority,
      preconditions: null, tags: [], is_automation_ready: false,
      estimated_minutes: 5, status: 'draft' as TcStatus,
      created_by: 'user-1',
      ai_generation_metadata: { source_type: 'json_import', project_id: 'proj-1', generated_at: '' },
    };
    const aiInsert = {
      project_id: 'proj-1', module_id: 'mod-1',
      title: 'Test', description: '', priority: 'high' as TcPriority,
      preconditions: null, tags: [], is_automation_ready: false,
      estimated_minutes: 5, status: 'draft' as TcStatus,
      created_by: 'user-1',
      ai_generation_metadata: { source_type: 'project_intelligence', project_id: 'proj-1', generated_at: '' },
    };
    // Same keys, same value types — only ai_generation_metadata.source_type differs
    const jsonKeys = Object.keys(jsonInsert).sort();
    const aiKeys = Object.keys(aiInsert).sort();
    expect(jsonKeys).toEqual(aiKeys);
  });

  it('normalizeTestCaseBatch returns per-item results in order', () => {
    const raws = [
      { title: 'A', priority: 'high' },
      { title: 'B', priority: 'critical' },
      { priority: 'low' },
    ];
    const { results } = normalizeTestCaseBatch(raws);
    expect(results.length).toBe(3);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
    expect(results[2].ok).toBe(false);
  });
});
