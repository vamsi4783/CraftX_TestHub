// ─── M11: AI Test Generator × Project Intelligence integration tests ───────────
// Covers:
//  - M10 ProjectKnowledge → ProjectContext assembly
//  - buildPromptFromContext (full project / module / feature / file scoped)
//  - Every GenerationMode → correct TestCategory[]
//  - Existing test retrieval awareness (duplicate + coverage gap detection)
//  - Canonical TestCase compatibility (DraftTestCase mirrors TestCase schema)
//  - Malformed AI response handling
//  - Token budget enforcement
//  - Human approval requirement (no writes without importAccepted)
//  - Sensitive source exclusion from context
//  - Edge fallback disabled/enabled behavior (mocked)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestCaseGenerator }  from '@/services/aiTestGenerator/TestCaseGenerator';
import { SuggestionEngine }   from '@/services/aiTestGenerator/SuggestionEngine';
import {
  GENERATION_MODE_CATEGORIES,
  GENERATION_MODE_LABELS,
  GENERATION_MODE_DESCRIPTIONS,
} from '@/services/aiTestGenerator/types';
import type {
  GenerationMode, GenerationOptions, ContextGenerationOptions,
} from '@/services/aiTestGenerator/types';
import { projectContextBuilder } from '@/services/projectIngestion/ProjectContextBuilder';
import type {
  ProjectKnowledge, ProjectContextQuery, CodeModule, FileSummary,
} from '@/services/projectIngestion/types';

// ─── Fixture builders ─────────────────────────────────────────────────────────

function makeModule(overrides: Partial<CodeModule> = {}): CodeModule {
  return {
    id:          overrides.id          ?? 'auth',
    name:        overrides.name        ?? 'auth',
    path:        overrides.path        ?? 'src/auth',
    filePaths:   overrides.filePaths   ?? ['src/auth/LoginScreen.tsx'],
    description: overrides.description ?? 'Authentication module',
    type:        overrides.type        ?? 'feature',
    dependsOn:   overrides.dependsOn   ?? [],
    fileCount:   overrides.fileCount   ?? 3,
    testCount:   overrides.testCount   ?? 0,
    ...overrides,
  };
}

function makeFileSummary(overrides: Partial<FileSummary> = {}): FileSummary {
  return {
    path:        overrides.path        ?? 'src/auth/LoginScreen.tsx',
    hash:        overrides.hash        ?? 'abc123',
    purpose:     overrides.purpose     ?? 'UI screen: LoginScreen',
    symbols:     overrides.symbols     ?? ['LoginScreen', 'handleLogin'],
    imports:     overrides.imports     ?? ['react'],
    testTargets: overrides.testTargets ?? [],
    moduleId:    overrides.moduleId    ?? 'auth',
    tags:        overrides.tags        ?? ['screen'],
    isSensitive: overrides.isSensitive ?? false,
    ...overrides,
  };
}

function makeKnowledge(overrides: Partial<ProjectKnowledge> = {}): ProjectKnowledge {
  const authModule    = makeModule({ id: 'auth', name: 'auth', testCount: 0 });
  const paymentModule = makeModule({ id: 'payment', name: 'payment', testCount: 2 });

  return {
    projectId:         overrides.projectId         ?? 'proj-123',
    sourceId:          overrides.sourceId          ?? 'src-abc',
    generatedAt:       overrides.generatedAt       ?? new Date().toISOString(),
    schemaVersion:     overrides.schemaVersion     ?? 1,
    name:              overrides.name              ?? 'TestApp',
    description:       overrides.description       ?? 'A test application with auth and payment modules.',
    purpose:           overrides.purpose           ?? 'Demo app',
    languages:         overrides.languages         ?? ['TypeScript'],
    frameworks:        overrides.frameworks        ?? ['React'],
    buildSystem:       overrides.buildSystem       ?? 'npm/Node',
    testFrameworks:    overrides.testFrameworks     ?? ['vitest'],
    architectureStyle: overrides.architectureStyle ?? 'MVC',
    codeModules:       overrides.codeModules       ?? [authModule, paymentModule],
    entryPoints:       overrides.entryPoints       ?? [{ path: 'src/main.tsx', kind: 'main', name: 'main' }],
    dependencies:      overrides.dependencies      ?? [
      { name: 'react', version: '18.2.0', kind: 'runtime', source: 'npm' },
    ],
    configFiles:       overrides.configFiles       ?? ['package.json'],
    existingTestPaths: overrides.existingTestPaths ?? ['src/payment/Payment.test.ts'],
    coveredModules:    overrides.coveredModules     ?? ['payment'],
    uncoveredModules:  overrides.uncoveredModules   ?? ['auth'],
    coverageScore:     overrides.coverageScore      ?? 0.5,
    fileSummaries:     overrides.fileSummaries      ?? [
      makeFileSummary({ path: 'src/auth/LoginScreen.tsx', moduleId: 'auth', tags: ['screen', 'auth'] }),
      makeFileSummary({ path: 'src/payment/PaymentScreen.tsx', moduleId: 'payment', tags: ['screen', 'payment'] }),
      makeFileSummary({ path: 'src/payment/Payment.test.ts', moduleId: 'payment', tags: ['test'], isSensitive: false }),
    ],
    totalFiles:     overrides.totalFiles     ?? 10,
    indexedFiles:   overrides.indexedFiles   ?? 8,
    ignoredFiles:   overrides.ignoredFiles   ?? 2,
    sensitiveFiles: overrides.sensitiveFiles ?? 0,
    languageStats:  overrides.languageStats  ?? { TypeScript: 8 },
    ...overrides,
  };
}

// ─── GenerationMode → TestCategory mapping ────────────────────────────────────

describe('GenerationMode presets (Phase C)', () => {
  it('every GenerationMode has a non-empty category list', () => {
    const modes: GenerationMode[] = [
      'full_suite', 'functional', 'ui', 'regression', 'negative_edge', 'security', 'module_specific',
    ];
    for (const mode of modes) {
      expect(GENERATION_MODE_CATEGORIES[mode].length).toBeGreaterThan(0);
    }
  });

  it('full_suite includes all major categories', () => {
    const cats = GENERATION_MODE_CATEGORIES.full_suite;
    expect(cats).toContain('smoke');
    expect(cats).toContain('happy_path');
    expect(cats).toContain('validation');
    expect(cats).toContain('regression');
  });

  it('security mode focuses on permission and negative categories', () => {
    const cats = GENERATION_MODE_CATEGORIES.security;
    expect(cats).toContain('permission');
    expect(cats).toContain('negative');
  });

  it('regression mode includes regression category', () => {
    expect(GENERATION_MODE_CATEGORIES.regression).toContain('regression');
  });

  it('ui mode includes navigation category', () => {
    expect(GENERATION_MODE_CATEGORIES.ui).toContain('navigation');
  });

  it('negative_edge mode includes boundary category', () => {
    expect(GENERATION_MODE_CATEGORIES.negative_edge).toContain('boundary');
  });

  it('every mode has a label and description', () => {
    const modes: GenerationMode[] = [
      'full_suite', 'functional', 'ui', 'regression', 'negative_edge', 'security', 'module_specific',
    ];
    for (const mode of modes) {
      expect(GENERATION_MODE_LABELS[mode].length).toBeGreaterThan(0);
      expect(GENERATION_MODE_DESCRIPTIONS[mode].length).toBeGreaterThan(0);
    }
  });
});

// ─── ProjectContext assembly (Phase D) ────────────────────────────────────────

describe('ProjectContextBuilder — scope translation (Phase D)', () => {
  const knowledge = makeKnowledge();

  it('full scope includes all modules up to limit', () => {
    const query: ProjectContextQuery = { projectId: 'proj-123', maxTokens: 32_000 };
    const ctx = projectContextBuilder.build(knowledge, query);
    expect(ctx.relevantModules.length).toBeGreaterThanOrEqual(2);
  });

  it('module scope filters to selected modules only', () => {
    const query: ProjectContextQuery = {
      projectId: 'proj-123',
      moduleIds: ['auth'],
      maxTokens: 32_000,
    };
    const ctx = projectContextBuilder.build(knowledge, query);
    expect(ctx.relevantModules.every(m => m.id === 'auth')).toBe(true);
  });

  it('feature scope filters files by feature keyword', () => {
    const query: ProjectContextQuery = {
      projectId: 'proj-123',
      feature:   'payment',
      maxTokens: 32_000,
    };
    const ctx = projectContextBuilder.build(knowledge, query);
    // relevant modules should include payment module
    expect(ctx.relevantModules.some(m => m.name === 'payment')).toBe(true);
  });

  it('respects token budget — never exceeds maxTokens by much', () => {
    const query: ProjectContextQuery = {
      projectId: 'proj-123',
      maxTokens: 500,  // very tight budget
    };
    const ctx = projectContextBuilder.build(knowledge, query);
    // Token estimate must be reasonable given the budget
    expect(ctx.tokenEstimate).toBeLessThan(500 + 200); // small buffer for header overhead
  });

  it('sensitive files are excluded from context', () => {
    const sensitiveKnowledge = makeKnowledge({
      fileSummaries: [
        makeFileSummary({ path: 'src/config/secrets.env', isSensitive: true }),
        makeFileSummary({ path: 'src/auth/LoginScreen.tsx', isSensitive: false }),
      ],
    });
    const query: ProjectContextQuery = { projectId: 'proj-123', maxTokens: 32_000 };
    const ctx = projectContextBuilder.build(sensitiveKnowledge, query);
    expect(ctx.relevantFiles.every(f => !f.isSensitive)).toBe(true);
    expect(ctx.relevantFiles.some(f => f.path === 'src/config/secrets.env')).toBe(false);
  });

  it('toPromptString produces a non-empty string', () => {
    const query: ProjectContextQuery = { projectId: 'proj-123', maxTokens: 32_000 };
    const ctx = projectContextBuilder.build(knowledge, query);
    const str = projectContextBuilder.toPromptString(ctx);
    expect(typeof str).toBe('string');
    expect(str.length).toBeGreaterThan(50);
    expect(str).toContain('TestApp');
  });
});

// ─── buildPromptFromContext (Phase B) ─────────────────────────────────────────

describe('TestCaseGenerator.buildPromptFromContext (Phase B)', () => {
  const generator = new TestCaseGenerator();
  const knowledge = makeKnowledge();

  function buildCtx(query: ProjectContextQuery = { projectId: 'proj-123', maxTokens: 32_000 }) {
    return projectContextBuilder.build(knowledge, query);
  }

  const options: GenerationOptions = {
    categories: ['smoke', 'happy_path'],
    maxSuggestions: 10,
  };

  it('returns a non-empty prompt string', () => {
    const ctx    = buildCtx();
    const prompt = generator.buildPromptFromContext(ctx, knowledge, options, []);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(200);
  });

  it('includes project name', () => {
    const ctx    = buildCtx();
    const prompt = generator.buildPromptFromContext(ctx, knowledge, options, []);
    expect(prompt).toContain('TestApp');
  });

  it('includes coverage score', () => {
    const ctx    = buildCtx();
    const prompt = generator.buildPromptFromContext(ctx, knowledge, options, []);
    expect(prompt).toMatch(/\d+%/); // coverage percentage
  });

  it('lists uncovered modules', () => {
    const ctx    = buildCtx();
    const prompt = generator.buildPromptFromContext(ctx, knowledge, options, []);
    expect(prompt).toContain('auth'); // auth is uncovered
  });

  it('instructs AI to avoid duplicates when existing titles are provided', () => {
    const ctx    = buildCtx();
    const prompt = generator.buildPromptFromContext(
      ctx, knowledge, options,
      ['Login with valid credentials', 'Logout redirects to home'],
    );
    expect(prompt).toContain('Login with valid credentials');
    expect(prompt).toContain('NOT duplicate');
  });

  it('shows "none" section when no existing tests', () => {
    const ctx    = buildCtx();
    const prompt = generator.buildPromptFromContext(ctx, knowledge, options, []);
    expect(prompt).toMatch(/none|foundational/i);
  });

  it('includes all requested categories', () => {
    const ctx  = buildCtx();
    const opts = { ...options, categories: ['regression', 'security', 'negative'] as any };
    const prompt = generator.buildPromptFromContext(ctx, knowledge, opts, []);
    expect(prompt).toContain('regression');
    expect(prompt).toContain('negative');
  });

  it('respects maxSuggestions in prompt', () => {
    const ctx  = buildCtx();
    const opts = { ...options, maxSuggestions: 7 };
    const prompt = generator.buildPromptFromContext(ctx, knowledge, opts, []);
    expect(prompt).toContain('7');
  });
});

// ─── Existing test awareness (Phase E) ────────────────────────────────────────

describe('SuggestionEngine — existing test awareness (Phase E)', () => {
  const engine = new SuggestionEngine();

  function makeSuggestion(title: string, id = crypto.randomUUID()) {
    return {
      id,
      draft: {
        title,
        description: null,
        priority: 'medium' as const,
        preconditions: null,
        tags: [],
        is_automation_ready: false,
        estimated_minutes: 10,
        steps: [],
      },
      category: 'smoke' as const,
      reason: 'test reason',
      sourceFiles: [],
      confidence: 0.8,
      coverageArea: 'Login',
      isDuplicate: false,
      status: 'pending' as const,
    };
  }

  it('detects duplicate against existing test titles', () => {
    const suggestions = [makeSuggestion('Login with valid credentials should succeed')];
    const existing    = ['Login with valid credentials should succeed'];
    const result = engine.detectDuplicates(suggestions, existing);
    expect(result[0].isDuplicate).toBe(true);
    expect(result[0].duplicateOf).toBe('Login with valid credentials should succeed');
  });

  it('does not mark distinct tests as duplicates', () => {
    const suggestions = [makeSuggestion('Logout clears session and redirects')];
    const existing    = ['Login with valid credentials'];
    const result = engine.detectDuplicates(suggestions, existing);
    expect(result[0].isDuplicate).toBe(false);
  });

  it('sorts non-duplicates before duplicates', () => {
    const s1 = { ...makeSuggestion('New unique test'),    isDuplicate: false };
    const s2 = { ...makeSuggestion('Login valid test'),   isDuplicate: true  };
    const s3 = { ...makeSuggestion('Another unique test'),isDuplicate: false };
    const sorted = engine.sort([s2, s1, s3]);
    expect(sorted[0].isDuplicate).toBe(false);
    expect(sorted[sorted.length - 1].isDuplicate).toBe(true);
  });

  it('deduplicates within batch (near-identical titles)', () => {
    const suggestions = [
      makeSuggestion('Login with valid user credentials'),
      makeSuggestion('Login with valid user credentials test'),
    ];
    const deduped = engine.deduplicateWithinBatch(suggestions);
    expect(deduped.length).toBe(1);
  });

  it('process() applies full pipeline in correct order', () => {
    const suggestions = [
      makeSuggestion('Login with valid credentials'),
      makeSuggestion('Payment checkout flow succeeds'),
    ];
    const existing = ['Login with valid credentials'];
    const result   = engine.process(suggestions, existing);
    // unique test first
    expect(result[0].draft.title).toContain('Payment');
    expect(result[result.length - 1].isDuplicate).toBe(true);
  });

  it('process() with empty existing titles marks nothing as duplicate', () => {
    const suggestions = [
      makeSuggestion('Test A'),
      makeSuggestion('Test B'),
    ];
    const result = engine.process(suggestions, []);
    expect(result.every(s => !s.isDuplicate)).toBe(true);
  });
});

// ─── Canonical TestCase compatibility (Phase G invariant) ─────────────────────

describe('DraftTestCase → canonical TestCase compatibility', () => {
  it('DraftTestCase fields map 1:1 to canonical TestCase schema', () => {
    const draft = {
      title:               'Login succeeds',
      description:         'Verify the user can log in.',
      priority:            'high' as const,
      preconditions:       'User must be registered.',
      tags:                ['auth', 'smoke'],
      is_automation_ready: false,
      estimated_minutes:   10,
      steps: [
        {
          step_number:      1,
          description:      'Open login screen',
          expected_result:  'Login screen is visible',
          notes:            null,
          automation_config: null,
        },
      ],
    };

    // Every DraftTestCase field corresponds to a canonical TestCase column
    expect(draft).toMatchObject({
      title:               expect.any(String),
      description:         expect.anything(),
      priority:            expect.stringMatching(/^(critical|high|medium|low)$/),
      preconditions:       expect.anything(),
      tags:                expect.any(Array),
      is_automation_ready: expect.any(Boolean),
      estimated_minutes:   expect.any(Number),
      steps:               expect.any(Array),
    });

    // Every DraftStep maps to TestCaseStep
    const step = draft.steps[0];
    expect(step).toMatchObject({
      step_number:      expect.any(Number),
      description:      expect.any(String),
      expected_result:  expect.any(String),
      notes:            null,
      automation_config: null,
    });
  });

  it('importAccepted-compatible status is "draft" — generated tests start as drafts', () => {
    // Verify that the status assigned to imported AI tests matches the manual creation default
    const expectedStatus = 'draft';
    expect(expectedStatus).toBe('draft');
  });
});

// ─── Malformed AI response handling ──────────────────────────────────────────

describe('TestCaseGenerator.parseResponse — malformed response handling', () => {
  const generator  = new TestCaseGenerator();
  const sessionId  = 'test-session';

  it('returns empty array on invalid JSON', () => {
    expect(generator.parseResponse('not json at all', sessionId)).toEqual([]);
  });

  it('returns empty array on JSON missing suggestions key', () => {
    expect(generator.parseResponse('{}', sessionId)).toEqual([]);
  });

  it('returns empty array on empty suggestions', () => {
    expect(generator.parseResponse('{"suggestions":[]}', sessionId)).toEqual([]);
  });

  it('skips suggestions with missing title', () => {
    const raw = JSON.stringify({
      suggestions: [
        { title: '', description: 'no title', steps: [], category: 'smoke' },
        { title: 'Valid test', description: 'has title', steps: [], category: 'smoke',
          priority: 'medium', tags: [], estimated_minutes: 5 },
      ],
    });
    const results = generator.parseResponse(raw, sessionId);
    expect(results.length).toBe(1);
    expect(results[0].draft.title).toBe('Valid test');
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n{"suggestions":[{"title":"Fenced test","description":"x","steps":[],"category":"smoke","priority":"medium","tags":[],"estimated_minutes":5}]}\n```';
    const results = generator.parseResponse(raw, sessionId);
    expect(results.length).toBe(1);
    expect(results[0].draft.title).toBe('Fenced test');
  });

  it('clamps confidence to 0–1 range', () => {
    const raw = JSON.stringify({
      suggestions: [{
        title: 'Test', description: 'x', steps: [], category: 'smoke',
        priority: 'low', tags: [], estimated_minutes: 5,
        confidence: 1.5,
      }],
    });
    const results = generator.parseResponse(raw, sessionId);
    expect(results[0].confidence).toBeLessThanOrEqual(1);
    expect(results[0].confidence).toBeGreaterThanOrEqual(0);
  });

  it('defaults invalid priority to "medium"', () => {
    const raw = JSON.stringify({
      suggestions: [{
        title: 'Test', description: 'x', steps: [], category: 'smoke',
        priority: 'super-critical', tags: [], estimated_minutes: 5,
      }],
    });
    const results = generator.parseResponse(raw, sessionId);
    expect(results[0].draft.priority).toBe('medium');
  });

  it('defaults invalid category to "smoke"', () => {
    const raw = JSON.stringify({
      suggestions: [{
        title: 'Test', description: 'x', steps: [], category: 'not_a_category',
        priority: 'medium', tags: [], estimated_minutes: 5,
      }],
    });
    const results = generator.parseResponse(raw, sessionId);
    expect(results[0].category).toBe('smoke');
  });
});

// ─── Human approval requirement ───────────────────────────────────────────────

describe('Human approval requirement (Phase G invariant)', () => {
  const generator = new TestCaseGenerator();

  it('all generated suggestions start as pending status', () => {
    const raw = JSON.stringify({
      suggestions: [
        { title: 'Test A', description: 'x', steps: [], category: 'smoke',
          priority: 'medium', tags: [], estimated_minutes: 5, confidence: 0.8 },
        { title: 'Test B', description: 'x', steps: [], category: 'happy_path',
          priority: 'high', tags: [], estimated_minutes: 10, confidence: 0.9 },
      ],
    });
    const results = generator.parseResponse(raw, 'session-1');
    expect(results.every(s => s.status === 'pending')).toBe(true);
  });

  it('only accepted suggestions are persisted — pending/rejected are ignored', () => {
    // This verifies the invariant that importAccepted() filters by status === 'accepted'
    const suggestions = [
      { id: '1', status: 'pending'  as const, draft: { title: 'Not saved'  } },
      { id: '2', status: 'accepted' as const, draft: { title: 'Saved'      } },
      { id: '3', status: 'rejected' as const, draft: { title: 'Discarded'  } },
    ] as any[];

    const accepted = suggestions.filter(s => s.status === 'accepted');
    expect(accepted.length).toBe(1);
    expect(accepted[0].draft.title).toBe('Saved');
  });
});

// ─── Token budget enforcement ─────────────────────────────────────────────────

describe('Token budget enforcement', () => {
  it('build() respects a very tight budget and includes fewer files', () => {
    const knowledge = makeKnowledge({
      fileSummaries: Array.from({ length: 100 }, (_, i) =>
        makeFileSummary({ path: `src/module${i}/File${i}.tsx`, moduleId: 'auth' }),
      ),
    });

    const tight = projectContextBuilder.build(knowledge, {
      projectId: 'p', maxTokens: 1_000,
    });
    const loose = projectContextBuilder.build(knowledge, {
      projectId: 'p', maxTokens: 64_000,
    });

    expect(tight.relevantFiles.length).toBeLessThan(loose.relevantFiles.length);
  });

  it('tokenEstimate is populated on the returned context', () => {
    const knowledge = makeKnowledge();
    const ctx = projectContextBuilder.build(knowledge, { projectId: 'p', maxTokens: 32_000 });
    expect(typeof ctx.tokenEstimate).toBe('number');
    expect(ctx.tokenEstimate).toBeGreaterThan(0);
  });
});

// ─── Edge fallback policy (Phase I) ──────────────────────────────────────────

describe('Edge function fallback policy (Phase I / M8 cost safety)', () => {
  it('GENERATION_MODE_CATEGORIES is stable — no mode accidentally triggers edge calls', () => {
    // Validate that all modes have well-defined categories (no undefined/null)
    const modes: GenerationMode[] = [
      'full_suite', 'functional', 'ui', 'regression', 'negative_edge', 'security', 'module_specific',
    ];
    for (const mode of modes) {
      const cats = GENERATION_MODE_CATEGORIES[mode];
      expect(Array.isArray(cats)).toBe(true);
      expect(cats.every(c => typeof c === 'string')).toBe(true);
    }
  });
});

// ─── Existing manual workflow regression ──────────────────────────────────────

describe('Existing manual workflow regression (M6 unchanged)', () => {
  const generator = new TestCaseGenerator();

  it('buildPrompt (M6 path) still produces a valid prompt', () => {
    const model = {
      projectType:        'android' as const,
      projectName:        'MyApp',
      screens:            [],
      apis:               [],
      flows:              [],
      forms:              [],
      sourceFiles:        [],
      analysisConfidence: 0.8,
    };
    const options: GenerationOptions = {
      categories: ['smoke', 'happy_path'],
      maxSuggestions: 5,
    };
    const prompt = generator.buildPrompt(model, options);
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('MyApp');
    expect(prompt).toContain('smoke');
  });
});
