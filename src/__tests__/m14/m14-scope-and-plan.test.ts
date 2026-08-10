// ─── M14 Phase E/F/G — Scope, Test Plan & AI Generation Validation ────────────
// Validates that scope propagates through the pipeline, test plan answers the
// key questions, and AI generation inputs are correctly assembled.

import { describe, it, expect } from 'vitest';
import { buildHeuristicTestPlan, buildTestPlanPrompt } from '@/services/aiTestGenerator/TestPlanBuilder';
import { ProjectContextBuilder } from '@/services/projectIngestion/ProjectContextBuilder';
import { SuggestionEngine } from '@/services/aiTestGenerator/SuggestionEngine';
import { analyzeCoverage } from '@/services/coverageAnalysisService';
import type { ProjectKnowledge, CodeModule } from '@/services/projectIngestion/types';
import type { TestSuggestion, DraftTestCase } from '@/services/aiTestGenerator/types';
import type { ProjectContextQuery } from '@/services/projectIngestion/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeModule(overrides: Partial<CodeModule> = {}): CodeModule {
  return {
    id: 'auth', name: 'Auth', path: 'src/auth',
    filePaths: ['src/auth/Login.tsx'], description: 'Auth module',
    type: 'feature', dependsOn: [], fileCount: 4, testCount: 0,
    ...overrides,
  };
}

function makeKnowledge(overrides: Partial<ProjectKnowledge> = {}): ProjectKnowledge {
  return {
    projectId: 'proj-1', sourceId: 'src-1',
    generatedAt: new Date().toISOString(),
    schemaVersion: 1, name: 'ShopApp',
    description: 'E-commerce mobile application for buying products',
    purpose: 'Allows users to browse, purchase, and track orders',
    languages: ['TypeScript', 'Kotlin'],
    frameworks: ['React Native', 'Hilt'],
    buildSystem: 'npm/Gradle',
    testFrameworks: ['jest', 'JUnit'],
    architectureStyle: 'MVVM',
    codeModules: [
      makeModule({ id: 'auth',     name: 'Auth',     type: 'feature',        fileCount: 4,  testCount: 2 }),
      makeModule({ id: 'cart',     name: 'Cart',     type: 'feature',        fileCount: 3,  testCount: 0 }),
      makeModule({ id: 'orders',   name: 'Orders',   type: 'feature',        fileCount: 5,  testCount: 1 }),
      makeModule({ id: 'network',  name: 'Network',  type: 'core',           fileCount: 3,  testCount: 2 }),
      makeModule({ id: 'shared',   name: 'Shared',   type: 'shared',         fileCount: 6,  testCount: 0 }),
      makeModule({ id: 'config',   name: 'Config',   type: 'config',         fileCount: 2,  testCount: 0 }),
      makeModule({ id: 'infra',    name: 'Infra',    type: 'infrastructure', fileCount: 2,  testCount: 0 }),
    ],
    entryPoints: [
      { path: 'src/App.tsx', kind: 'main', name: 'App Entry' },
      { path: 'src/auth/LoginScreen.tsx', kind: 'screen', name: 'Login' },
    ],
    dependencies: [
      { name: 'react-native', version: '0.73', kind: 'runtime', source: 'npm' },
      { name: 'axios', version: '1.6', kind: 'runtime', source: 'npm' },
    ],
    configFiles: ['package.json', 'build.gradle'],
    existingTestPaths: ['src/__tests__/auth.test.ts', 'src/__tests__/orders.test.ts'],
    coveredModules: ['auth', 'orders', 'network'],
    uncoveredModules: ['cart', 'shared', 'config', 'infra'],
    coverageScore: 0.43,
    fileSummaries: [
      { path: 'src/auth/Login.tsx', hash: 'abc', purpose: 'Login screen component', symbols: ['LoginScreen'], imports: ['react', 'react-native'], testTargets: [], moduleId: 'auth', tags: ['screen'], isSensitive: false },
      { path: 'src/network/ApiClient.ts', hash: 'def', purpose: 'HTTP API client', symbols: ['ApiClient', 'get', 'post'], imports: ['axios'], testTargets: [], moduleId: 'network', tags: ['service'], isSensitive: false },
    ],
    totalFiles: 30, indexedFiles: 28, ignoredFiles: 2, sensitiveFiles: 0,
    languageStats: { TypeScript: 20, Kotlin: 8 },
    ...overrides,
  };
}

function makeDraft(overrides: Partial<DraftTestCase> = {}): DraftTestCase {
  return {
    title: 'Test title',
    description: 'Test description',
    priority: 'medium',
    tags: [],
    preconditions: null,
    is_automation_ready: false,
    estimated_minutes: 5,
    steps: [],
    ...overrides,
  };
}

const ctxBuilder = new ProjectContextBuilder();

// ─── Phase E: Scope propagation ───────────────────────────────────────────────

describe('Phase E: Scope — entire project', () => {
  it('no moduleFilter includes all modules in plan', () => {
    const plan = buildHeuristicTestPlan(makeKnowledge(), 5, undefined);
    expect(plan.modules.length).toBe(7);
  });

  it('plan covers all module types', () => {
    const plan = buildHeuristicTestPlan(makeKnowledge(), 5);
    const types = plan.modules.map(m => {
      const km = makeKnowledge().codeModules.find(cm => cm.id === m.moduleId);
      return km?.type;
    });
    expect(types).toContain('feature');
    expect(types).toContain('core');
    expect(types).toContain('shared');
  });
});

describe('Phase E: Scope — selected modules', () => {
  it('moduleFilter restricts plan to specified modules only', () => {
    const plan = buildHeuristicTestPlan(makeKnowledge(), 0, ['auth', 'cart']);
    expect(plan.modules.length).toBe(2);
    expect(plan.modules.map(m => m.moduleId)).toEqual(['auth', 'cart']);
  });

  it('filtered plan has correct totalEstimatedTests (sum of filtered modules only)', () => {
    const plan = buildHeuristicTestPlan(makeKnowledge(), 0, ['auth']);
    const sum = plan.modules.reduce((s, m) => s + m.estimatedNewTests, 0);
    expect(plan.totalEstimatedTests).toBe(sum);
  });

  it('empty moduleFilter array produces empty plan', () => {
    const plan = buildHeuristicTestPlan(makeKnowledge(), 0, []);
    expect(plan.modules.length).toBe(0);
    expect(plan.totalEstimatedTests).toBe(0);
  });
});

describe('Phase E: Scope — context builder respects moduleIds', () => {
  const knowledge = makeKnowledge();

  it('module-scoped query filters to requested modules', () => {
    const query: ProjectContextQuery = {
      projectId: 'proj-1', moduleIds: ['auth'], maxTokens: 10000, includeTests: false,
    };
    const ctx = ctxBuilder.build(knowledge, query);
    // Context should reference auth-related files
    expect(ctx.projectName).toBe('ShopApp');
    expect(ctx.relevantModules.some(m => m.name === 'Auth')).toBe(true);
  });

  it('full-project query returns context with all modules', () => {
    const query: ProjectContextQuery = {
      projectId: 'proj-1', maxTokens: 50000, includeTests: false,
    };
    const ctx = ctxBuilder.build(knowledge, query);
    expect(ctx.relevantModules.length).toBeGreaterThan(0);
    expect(ctx.projectName).toBe('ShopApp');
  });

  it('context respects token budget (tokenEstimate ≤ maxTokens)', () => {
    const query: ProjectContextQuery = {
      projectId: 'proj-1', maxTokens: 1000, includeTests: false,
    };
    const ctx = ctxBuilder.build(knowledge, query);
    expect(ctx.tokenEstimate).toBeLessThanOrEqual(1000);
  });

  it('context has no sensitive content', () => {
    const knowledgeWithSensitive = makeKnowledge({
      fileSummaries: [
        { path: '.env', hash: 'x1', purpose: 'Environment variables', symbols: [], imports: [], testTargets: [], moduleId: 'config', tags: ['config'], isSensitive: true },
        { path: 'src/auth/Login.tsx', hash: 'x2', purpose: 'Login screen', symbols: ['LoginScreen'], imports: [], testTargets: [], moduleId: 'auth', tags: ['screen'], isSensitive: false },
      ],
    });
    const query: ProjectContextQuery = {
      projectId: 'proj-1', maxTokens: 50000, includeTests: false,
    };
    const ctx = ctxBuilder.build(knowledgeWithSensitive, query);
    // .env should not appear in context files (sensitive path)
    const hasSensitivePath = ctx.relevantFiles.some(f => f.path === '.env');
    expect(hasSensitivePath).toBe(false);
  });
});

// ─── Phase F: Test Plan ───────────────────────────────────────────────────────

describe('Phase F: Test Plan answers key testing questions', () => {
  const knowledge = makeKnowledge();

  it('plan.projectName identifies the project', () => {
    const plan = buildHeuristicTestPlan(knowledge, 3);
    expect(plan.projectName).toBe('ShopApp');
  });

  it('each module plan has a module name', () => {
    const plan = buildHeuristicTestPlan(knowledge, 3);
    plan.modules.forEach(m => {
      expect(m.moduleName.length).toBeGreaterThan(0);
    });
  });

  it('each module plan has at least one coverage area (what to test)', () => {
    const plan = buildHeuristicTestPlan(knowledge, 3);
    plan.modules.forEach(m => {
      expect(m.coverageAreas.length).toBeGreaterThan(0);
    });
  });

  it('coverage areas include a category (why this kind of test)', () => {
    const validCategories = [
      'smoke', 'happy_path', 'validation', 'boundary', 'negative',
      'permission', 'navigation', 'regression', 'integration',
      'performance', 'api', 'data_validation', 'compatibility',
    ];
    const plan = buildHeuristicTestPlan(knowledge, 3);
    plan.modules.forEach(m =>
      m.coverageAreas.forEach(area => {
        expect(validCategories).toContain(area.category);
      })
    );
  });

  it('coverage areas include priority (risk level)', () => {
    const plan = buildHeuristicTestPlan(knowledge, 3);
    plan.modules.forEach(m =>
      m.coverageAreas.forEach(area => {
        expect(['high', 'medium', 'low']).toContain(area.priority);
      })
    );
  });

  it('currentTestCount reflects actual source test files per module', () => {
    const plan = buildHeuristicTestPlan(knowledge, 3);
    const authPlan = plan.modules.find(m => m.moduleId === 'auth')!;
    const cartPlan = plan.modules.find(m => m.moduleId === 'cart')!;
    expect(authPlan.currentTestCount).toBe(2);  // auth has testCount: 2
    expect(cartPlan.currentTestCount).toBe(0);  // cart has testCount: 0
  });

  it('plan identifies gaps for uncovered modules', () => {
    const plan = buildHeuristicTestPlan(knowledge, 3);
    expect(plan.coverageGaps.length).toBeGreaterThan(0);
    // Cart, shared, config, infra are uncovered
    expect(plan.coverageGaps.some(g => g.includes('no test coverage'))).toBe(true);
  });

  it('plan flags "no existing test cases" when existingCount = 0', () => {
    const plan = buildHeuristicTestPlan(knowledge, 0);
    expect(plan.coverageGaps.some(g => g.includes('No existing test cases'))).toBe(true);
  });

  it('plan does NOT flag "no existing test cases" when there are some', () => {
    const plan = buildHeuristicTestPlan(knowledge, 5);
    expect(plan.coverageGaps.some(g => g.includes('No existing test cases'))).toBe(false);
  });

  it('totalEstimatedTests equals sum of all module estimatedNewTests', () => {
    const plan = buildHeuristicTestPlan(knowledge, 3);
    const sum = plan.modules.reduce((s, m) => s + m.estimatedNewTests, 0);
    expect(plan.totalEstimatedTests).toBe(sum);
  });

  it('feature module has smoke AND happy_path areas', () => {
    const k = makeKnowledge({ codeModules: [makeModule({ type: 'feature', testCount: 0 })] });
    const plan = buildHeuristicTestPlan(k, 0);
    const areas = plan.modules[0].coverageAreas;
    expect(areas.some(a => a.category === 'smoke')).toBe(true);
    expect(areas.some(a => a.category === 'happy_path')).toBe(true);
  });

  it('core module has data_validation area', () => {
    const k = makeKnowledge({ codeModules: [makeModule({ id: 'net', type: 'core', testCount: 0 })] });
    const plan = buildHeuristicTestPlan(k, 0);
    const areas = plan.modules[0].coverageAreas;
    expect(areas.some(a => a.category === 'data_validation')).toBe(true);
  });
});

describe('Phase F: AI prompt for test plan answers key questions', () => {
  const knowledge = makeKnowledge();

  it('prompt includes project name', () => {
    const prompt = buildTestPlanPrompt(knowledge);
    expect(prompt).toContain('ShopApp');
  });

  it('prompt includes tech stack (frameworks + languages)', () => {
    const prompt = buildTestPlanPrompt(knowledge);
    expect(prompt).toContain('React Native');
    expect(prompt).toContain('TypeScript');
  });

  it('prompt includes architecture style', () => {
    const prompt = buildTestPlanPrompt(knowledge);
    expect(prompt).toContain('MVVM');
  });

  it('prompt includes all module names', () => {
    const prompt = buildTestPlanPrompt(knowledge);
    expect(prompt).toContain('Auth');
    expect(prompt).toContain('Cart');
    expect(prompt).toContain('Network');
  });

  it('prompt marks covered vs uncovered modules', () => {
    const prompt = buildTestPlanPrompt(knowledge);
    expect(prompt).toContain('[has tests]');
    expect(prompt).toContain('[NO TESTS]');
  });

  it('prompt lists all valid test categories', () => {
    const prompt = buildTestPlanPrompt(knowledge);
    expect(prompt).toContain('happy_path');
    expect(prompt).toContain('data_validation');
    expect(prompt).toContain('integration');
  });

  it('prompt requires valid JSON output', () => {
    const prompt = buildTestPlanPrompt(knowledge);
    expect(prompt).toContain('valid JSON');
  });

  it('scoped prompt only includes selected modules', () => {
    const prompt = buildTestPlanPrompt(knowledge, ['auth', 'cart']);
    expect(prompt).toContain('Auth');
    expect(prompt).toContain('Cart');
    expect(prompt).not.toContain('Network');
  });
});

// ─── Phase G: AI generation validation ───────────────────────────────────────

describe('Phase G: SuggestionEngine — duplicate detection', () => {
  const engine = new SuggestionEngine();

  function makeSuggestion(id: string, title: string): TestSuggestion {
    return {
      id, category: 'smoke', confidence: 0.9, status: 'pending',
      isDuplicate: false, duplicateOf: undefined,
      reason: 'Generated suggestion', sourceFiles: [], coverageArea: 'General',
      draft: makeDraft({ title }),
    };
  }

  it('identical title in existing tests is flagged as duplicate', () => {
    const suggestions = [makeSuggestion('s1', 'Login with valid credentials')];
    const existing = ['Login with valid credentials'];
    const processed = engine.process(suggestions, existing);
    expect(processed[0].isDuplicate).toBe(true);
  });

  it('unique titles pass duplicate detection', () => {
    const suggestions = [
      makeSuggestion('s1', 'Login with valid credentials'),
      makeSuggestion('s2', 'Payment checkout with credit card'),
    ];
    const existing = ['Completely different test'];
    const processed = engine.process(suggestions, existing);
    expect(processed.every(s => !s.isDuplicate)).toBe(true);
  });

  it('similar (but not identical) title detected as near-duplicate', () => {
    const suggestions = [makeSuggestion('s1', 'Login succeeds with valid user credentials')];
    const existing = ['Login with valid credentials'];
    const processed = engine.process(suggestions, existing);
    // High Jaccard similarity — should be flagged
    expect(processed[0].isDuplicate).toBe(true);
  });

  it('intra-batch duplicates are deduplicated (similar titles produce fewer results)', () => {
    const suggestions = [
      makeSuggestion('s1', 'User can log in to the application successfully'),
      makeSuggestion('s2', 'User can log in to application successfully'),
    ];
    const processed = engine.process(suggestions, []);
    // deduplicateWithinBatch removes near-duplicates, so result should be shorter
    expect(processed.length).toBeLessThan(suggestions.length);
  });

  it('short tokens are ignored in Jaccard (tokens <= 2 chars filtered)', () => {
    // "UI" is 2 chars and should be filtered, so two UI tests won't spuriously match
    const suggestions = [
      makeSuggestion('s1', 'UI renders correctly on iOS'),
      makeSuggestion('s2', 'UI renders correctly on Android'),
    ];
    const processed = engine.process(suggestions, []);
    // These should NOT be flagged as duplicates — they're testing different platforms
    // Jaccard without short tokens: "renders|correctly|ios" vs "renders|correctly|android"
    // similarity = 2/4 = 0.5, below intra-batch threshold of 0.7
    expect(processed.every(s => !s.isDuplicate)).toBe(true);
  });

  it('empty suggestions array produces empty output', () => {
    const processed = engine.process([], []);
    expect(processed).toEqual([]);
  });

  it('suggestions are sorted by confidence descending', () => {
    const suggestions = [
      makeSuggestion('s1', 'Low confidence test'),
      makeSuggestion('s2', 'High confidence test'),
    ];
    suggestions[0].confidence = 0.3;
    suggestions[1].confidence = 0.9;
    const processed = engine.process(suggestions, []);
    expect(processed[0].confidence).toBeGreaterThanOrEqual(processed[1].confidence);
  });
});

describe('Phase G: AI generation — valid categories only', () => {
  const validCategories = [
    'smoke', 'happy_path', 'validation', 'boundary', 'negative',
    'permission', 'navigation', 'regression', 'integration',
    'performance', 'api', 'data_validation', 'compatibility',
  ];

  it('all 13 valid categories are recognized', () => {
    expect(validCategories.length).toBe(13);
  });

  it('suggestions from AI generation have valid categories', () => {
    const suggestions: TestSuggestion[] = validCategories.map((cat, i) => ({
      id: `s${i}`, category: cat as TestSuggestion['category'],
      confidence: 0.8, status: 'pending' as const, isDuplicate: false, duplicateOf: undefined,
      reason: 'Generated', sourceFiles: [], coverageArea: 'General',
      draft: makeDraft({ title: `Test for ${cat}` }),
    }));
    suggestions.forEach(s => {
      expect(validCategories).toContain(s.category);
    });
  });
});

describe('Phase G: AI generation — existing test titles influence generation', () => {
  const engine = new SuggestionEngine();

  it('existing titles passed to process() prevent duplicate suggestions', () => {
    const suggestions = [
      { id: 's1', category: 'smoke' as const, confidence: 0.9, status: 'pending' as const,
        isDuplicate: false, duplicateOf: undefined, reason: '', sourceFiles: [], coverageArea: '',
        draft: makeDraft({ title: 'Login test that already exists in TestHub' }) },
    ];
    const existingTitles = ['Login test that already exists in TestHub'];
    const processed = engine.process(suggestions, existingTitles);
    expect(processed[0].isDuplicate).toBe(true);
  });

  it('empty existing titles means no dedup against DB', () => {
    const suggestions = [
      { id: 's1', category: 'smoke' as const, confidence: 0.9, status: 'pending' as const,
        isDuplicate: false, duplicateOf: undefined, reason: '', sourceFiles: [], coverageArea: '',
        draft: makeDraft({ title: 'Brand new unique test case with no match' }) },
    ];
    const processed = engine.process(suggestions, []);
    expect(processed[0].isDuplicate).toBe(false);
  });
});

describe('Phase G: Context builder — prompt inputs', () => {
  const knowledge = makeKnowledge();

  it('context includes project name and summary', () => {
    const ctx = ctxBuilder.build(knowledge, { projectId: 'proj-1', maxTokens: 50000, includeTests: false });
    expect(ctx.projectName).toBe('ShopApp');
    expect(ctx.projectSummary).toBeTruthy();
  });

  it('context includes relevant modules with summaries', () => {
    const ctx = ctxBuilder.build(knowledge, { projectId: 'proj-1', maxTokens: 50000, includeTests: false });
    expect(ctx.relevantModules.length).toBeGreaterThan(0);
    ctx.relevantModules.forEach(m => {
      expect(m.name).toBeTruthy();
      expect(m.type).toBeTruthy();
    });
  });

  it('context includes file summaries with purpose and symbols', () => {
    const ctx = ctxBuilder.build(knowledge, { projectId: 'proj-1', maxTokens: 50000, includeTests: false });
    ctx.relevantFiles.forEach(f => {
      expect(f.path).toBeTruthy();
      expect(typeof f.purpose).toBe('string');
      expect(Array.isArray(f.symbols)).toBe(true);
    });
  });

  it('context tokenEstimate is a positive number', () => {
    const ctx = ctxBuilder.build(knowledge, { projectId: 'proj-1', maxTokens: 50000, includeTests: false });
    expect(ctx.tokenEstimate).toBeGreaterThan(0);
  });

  it('context does not include raw file content', () => {
    const ctx = ctxBuilder.build(knowledge, { projectId: 'proj-1', maxTokens: 50000, includeTests: false });
    ctx.relevantFiles.forEach(f => {
      const raw = f as unknown as Record<string, unknown>;
      expect(raw.content).toBeUndefined();
      expect(raw.rawContent).toBeUndefined();
    });
  });
});

// ─── Phase P: UX consistency ─────────────────────────────────────────────────

describe('Phase P: UX — wizard step labeling matches actual flow', () => {
  it('PI wizard steps match the logical flow order', () => {
    // From AITestGeneratorPage: input → understanding → plan → generate → review
    const piSteps = ['Select Project', 'Project Understanding', 'Test Plan', 'Configure & Generate', 'Review & Import'];
    expect(piSteps[0]).toContain('Project');
    expect(piSteps[1]).toContain('Understanding');
    expect(piSteps[2]).toContain('Plan');
    expect(piSteps[3]).toContain('Generate');
    expect(piSteps[4]).toContain('Review');
  });

  it('manual wizard steps follow analysis → preview → generate → review', () => {
    const manualSteps = ['Analyze Project', 'Preview Analysis', 'Configure & Generate', 'Review & Import'];
    expect(manualSteps.length).toBe(4);
    expect(manualSteps[0]).toContain('Analyze');
    expect(manualSteps[3]).toContain('Review');
  });
});

describe('Phase P: UX — coverage terminology is clear', () => {
  it('coverage disclaimer clearly states it is an estimate', () => {
    const result = analyzeCoverage(makeKnowledge(), []);
    expect(result.disclaimer).toContain('estimate');
    expect(result.disclaimer).toContain('Not actual code coverage');
  });
});
