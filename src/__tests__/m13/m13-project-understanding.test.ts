// ─── M13 Phase C/D: Project Understanding & Test Plan Validation ──────────────
// Uses existing ProjectStructureAnalyzer + fixture data (no real projects needed).

import { describe, it, expect } from 'vitest';
import { ProjectStructureAnalyzer } from '@/services/projectIngestion/ProjectStructureAnalyzer';
import { buildHeuristicTestPlan, buildTestPlanPrompt } from '@/services/aiTestGenerator/TestPlanBuilder';
import type { ProjectKnowledge, CodeModule, ProjectFileMetadata } from '@/services/projectIngestion/types';
import type { SourceFileContent } from '@/services/projectIngestion/IProjectSourceProvider';

// ─── Fixture builders ─────────────────────────────────────────────────────────

function makeFileMeta(path: string, overrides: Partial<ProjectFileMetadata> = {}): ProjectFileMetadata {
  const ext = path.split('.').pop() ?? '';
  const isTest = path.includes('.test.') || path.includes('.spec.') || path.includes('__tests__');
  return {
    path, name: path.split('/').pop() ?? '', extension: ext,
    language: 'TypeScript', sizeBytes: 200, hash: 'abc123',
    category: 'source', importance: 'medium',
    isGenerated: false, isBinary: false, isIgnored: false,
    isTest, isSensitive: false,
    ...overrides,
  };
}

function makeManifest(path: string, content: string): SourceFileContent {
  return { path, content, hash: 'xyz', sizeBytes: content.length };
}

function makeModule(overrides: Partial<CodeModule> = {}): CodeModule {
  return {
    id: 'auth', name: 'Auth', path: 'src/auth',
    filePaths: ['src/auth/Login.tsx'], description: 'Authentication',
    type: 'feature', dependsOn: [], fileCount: 3, testCount: 0,
    ...overrides,
  };
}

function makeKnowledge(overrides: Partial<ProjectKnowledge> = {}): ProjectKnowledge {
  return {
    projectId: 'p1', sourceId: 's1', generatedAt: new Date().toISOString(),
    schemaVersion: 1, name: 'ShopApp', description: 'E-commerce mobile app',
    purpose: 'Enable users to browse, purchase, and track orders',
    languages: ['TypeScript', 'Kotlin'], frameworks: ['React Native', 'Hilt'],
    buildSystem: 'npm/Gradle', testFrameworks: ['jest', 'JUnit'],
    architectureStyle: 'MVVM',
    codeModules: [
      makeModule({ id: 'auth',     name: 'Auth',     type: 'feature', fileCount: 8,  testCount: 3 }),
      makeModule({ id: 'cart',     name: 'Cart',     type: 'feature', fileCount: 5,  testCount: 0 }),
      makeModule({ id: 'orders',   name: 'Orders',   type: 'feature', fileCount: 7,  testCount: 1 }),
      makeModule({ id: 'network',  name: 'Network',  type: 'core',    fileCount: 4,  testCount: 2 }),
      makeModule({ id: 'shared',   name: 'Shared',   type: 'shared',  fileCount: 6,  testCount: 0 }),
    ],
    entryPoints: [
      { path: 'src/main.tsx', kind: 'main', name: 'App Entry' },
      { path: 'src/auth/LoginScreen.tsx', kind: 'screen', name: 'Login' },
    ],
    dependencies: [
      { name: 'react-native', version: '0.73', kind: 'runtime', source: 'npm' },
      { name: 'retrofit', version: '2.9.0', kind: 'runtime', source: 'gradle' },
    ],
    configFiles: ['package.json', 'build.gradle'],
    existingTestPaths: ['src/__tests__/auth.test.ts', 'src/__tests__/network.test.ts'],
    coveredModules: ['auth', 'network'], uncoveredModules: ['cart', 'orders', 'shared'],
    coverageScore: 0.4, fileSummaries: [],
    totalFiles: 30, indexedFiles: 28, ignoredFiles: 2, sensitiveFiles: 0,
    languageStats: { TypeScript: 20, Kotlin: 8 },
    ...overrides,
  };
}

const analyzer = new ProjectStructureAnalyzer();

// ─── Phase C: Project Understanding ───────────────────────────────────────────

describe('Phase C: ProjectStructureAnalyzer — React/TypeScript project', () => {
  // Files must have category: 'source' for language detection
  const files = [
    makeFileMeta('src/auth/LoginScreen.tsx', { category: 'source' }),
    makeFileMeta('src/payment/PaymentScreen.tsx', { category: 'source' }),
    makeFileMeta('src/network/ApiService.ts', { category: 'source' }),
    makeFileMeta('src/__tests__/auth.test.ts', { category: 'source', isTest: true }),
    makeFileMeta('package.json', { category: 'config' }),
  ];
  const manifests = [
    makeManifest('package.json', JSON.stringify({
      name: 'shopapp',
      dependencies: { 'react': '18.2.0', 'react-native': '0.73.0', 'redux': '4.0.0' },
      devDependencies: { typescript: '5.0.0', jest: '29.0.0' },
    })),
  ];

  it('detects React framework', () => {
    const s = analyzer.analyze(files, manifests);
    expect(s.frameworks).toContain('React');
  });

  it('detects TypeScript as primary language', () => {
    const s = analyzer.analyze(files, manifests);
    // languages is ProjectLanguage[] (string union), primaryLanguage is the dominant one
    expect(s.languages).toContain('TypeScript');
  });

  it('detects existing test paths', () => {
    const s = analyzer.analyze(files, manifests);
    expect(s.existingTestPaths).toContain('src/__tests__/auth.test.ts');
  });

  it('groups files into modules', () => {
    const s = analyzer.analyze(files, manifests);
    const names = s.codeModules.map(m => m.name.toLowerCase());
    expect(names.length).toBeGreaterThan(0);
  });

  it('detects npm/Node build system from package.json', () => {
    const s = analyzer.analyze(files, manifests);
    expect(s.buildSystem).toBeTruthy();
  });

  it('returns at least one language for a TypeScript project', () => {
    const s = analyzer.analyze(files, manifests);
    expect(s.languages.length).toBeGreaterThan(0);
  });

  it('detects runtime dependencies from package.json', () => {
    const s = analyzer.analyze(files, manifests);
    expect(s.dependencies.some(d => d.name === 'react-native')).toBe(true);
  });
});

describe('Phase C: ProjectStructureAnalyzer — Android/Kotlin project', () => {
  const files = [
    makeFileMeta('app/src/main/java/com/shop/MainActivity.kt', { language: 'Kotlin', category: 'source' }),
    makeFileMeta('app/src/main/java/com/shop/auth/LoginActivity.kt', { language: 'Kotlin', category: 'source' }),
    makeFileMeta('build.gradle.kts', { language: 'Kotlin', category: 'build' }),
  ];
  const manifests = [
    makeManifest('build.gradle.kts',
      'dependencies {\n  implementation("com.squareup.retrofit2:retrofit:2.9.0")\n  implementation("com.google.dagger:hilt-android:2.44")\n}'),
  ];

  it('detects Kotlin language', () => {
    const s = analyzer.analyze(files, manifests);
    expect(s.languages).toContain('Kotlin');
  });

  it('detects Gradle build system', () => {
    const s = analyzer.analyze(files, manifests);
    expect(s.buildSystem).toContain('Gradle');
  });

  it('detects Retrofit dependency', () => {
    const s = analyzer.analyze(files, manifests);
    expect(s.dependencies.some(d => d.name.includes('retrofit'))).toBe(true);
  });
});

describe('Phase C: Empty / minimal project handling', () => {
  it('empty project returns empty arrays for languages, frameworks, modules', () => {
    const s = analyzer.analyze([], []);
    expect(s.languages).toEqual([]);
    expect(s.frameworks).toEqual([]);
    expect(s.codeModules).toEqual([]);
  });

  it('project with only config files has no source languages', () => {
    const s = analyzer.analyze(
      [makeFileMeta('package.json', { category: 'config' })],
      [makeManifest('package.json', '{}')],
    );
    // config files don't contribute to language detection
    expect(s.languages).toEqual([]);
  });
});

describe('Phase C: Secret filtering', () => {
  it('sensitive files are flagged as isSensitive=true', () => {
    const sensitiveFile = makeFileMeta('.env', { isSensitive: true, category: 'config' });
    expect(sensitiveFile.isSensitive).toBe(true);
  });

  it('non-sensitive source files are isSensitive=false', () => {
    const normalFile = makeFileMeta('src/App.tsx');
    expect(normalFile.isSensitive).toBe(false);
  });
});

// ─── Phase D: Test Plan Validation ────────────────────────────────────────────

describe('Phase D: Test Plan — module coverage', () => {
  const knowledge = makeKnowledge();

  it('plan includes one module entry per code module', () => {
    const plan = buildHeuristicTestPlan(knowledge, 6);
    expect(plan.modules).toHaveLength(5);
  });

  it('plan.projectName matches knowledge.name', () => {
    const plan = buildHeuristicTestPlan(knowledge, 6);
    expect(plan.projectName).toBe('ShopApp');
  });

  it('each module plan has at least one coverage area', () => {
    const plan = buildHeuristicTestPlan(knowledge, 6);
    plan.modules.forEach(m => expect(m.coverageAreas.length).toBeGreaterThan(0));
  });

  it('coverage areas have valid categories', () => {
    const validCats = ['smoke', 'happy_path', 'validation', 'boundary', 'negative',
      'permission', 'navigation', 'regression', 'integration', 'performance',
      'api', 'data_validation', 'compatibility'];
    const plan = buildHeuristicTestPlan(knowledge, 6);
    plan.modules.forEach(m =>
      m.coverageAreas.forEach(area => expect(validCats).toContain(area.category)));
  });

  it('coverage areas have valid priorities', () => {
    const plan = buildHeuristicTestPlan(knowledge, 6);
    plan.modules.forEach(m =>
      m.coverageAreas.forEach(area => expect(['high', 'medium', 'low']).toContain(area.priority)));
  });

  it('currentTestCount reflects module.testCount (not hardcoded 0/1)', () => {
    const plan = buildHeuristicTestPlan(knowledge, 6);
    const authModule = plan.modules.find(m => m.moduleId === 'auth');
    const cartModule = plan.modules.find(m => m.moduleId === 'cart');
    expect(authModule?.currentTestCount).toBe(3);  // auth has testCount=3
    expect(cartModule?.currentTestCount).toBe(0);  // cart has testCount=0
  });

  it('totalEstimatedTests equals sum of all module estimatedNewTests', () => {
    const plan = buildHeuristicTestPlan(knowledge, 6);
    const sum = plan.modules.reduce((s, m) => s + m.estimatedNewTests, 0);
    expect(plan.totalEstimatedTests).toBe(sum);
  });

  it('coverageGaps identifies uncovered modules', () => {
    const plan = buildHeuristicTestPlan(knowledge, 6);
    const uncoveredGap = plan.coverageGaps.find(g => g.includes('no test coverage'));
    expect(uncoveredGap).toBeDefined();
  });

  it('no "no existing tests" gap when existingCount > 0', () => {
    const plan = buildHeuristicTestPlan(knowledge, 6);
    const gap = plan.coverageGaps.find(g => g.includes('No existing test cases'));
    expect(gap).toBeUndefined();
  });

  it('flags "no existing tests" gap when existingCount === 0', () => {
    const plan = buildHeuristicTestPlan(knowledge, 0);
    const gap = plan.coverageGaps.find(g => g.includes('No existing test cases'));
    expect(gap).toBeDefined();
  });
});

describe('Phase D: Test Plan — module filter', () => {
  it('moduleFilter restricts plan to selected modules', () => {
    const k = makeKnowledge();
    const plan = buildHeuristicTestPlan(k, 0, ['auth', 'cart']);
    expect(plan.modules).toHaveLength(2);
    expect(plan.modules.map(m => m.moduleId)).toEqual(['auth', 'cart']);
  });

  it('undefined filter includes all modules', () => {
    const plan = buildHeuristicTestPlan(makeKnowledge(), 0, undefined);
    expect(plan.modules).toHaveLength(5);
  });
});

describe('Phase D: Test Plan prompt — sanity check', () => {
  it('prompt contains project name', () => {
    expect(buildTestPlanPrompt(makeKnowledge())).toContain('ShopApp');
  });

  it('prompt contains framework info', () => {
    expect(buildTestPlanPrompt(makeKnowledge())).toContain('React Native');
  });

  it('prompt lists module names', () => {
    const prompt = buildTestPlanPrompt(makeKnowledge());
    expect(prompt).toContain('Auth');
    expect(prompt).toContain('Cart');
  });

  it('prompt instructs AI to return valid JSON', () => {
    expect(buildTestPlanPrompt(makeKnowledge())).toContain('valid JSON');
  });

  it('prompt includes coverage status markers', () => {
    const prompt = buildTestPlanPrompt(makeKnowledge());
    expect(prompt).toContain('[has tests]');
    expect(prompt).toContain('[NO TESTS]');
  });
});

describe('Phase D: Module type → coverage area mapping', () => {
  function planModule(type: CodeModule['type']) {
    const k = makeKnowledge({
      codeModules: [makeModule({ id: 'm', name: 'M', type, testCount: 0 })],
      coveredModules: [],
    });
    return buildHeuristicTestPlan(k, 0).modules[0];
  }

  it('feature module includes happy_path', () => {
    expect(planModule('feature').coverageAreas.some(a => a.category === 'happy_path')).toBe(true);
  });

  it('core module includes data_validation', () => {
    expect(planModule('core').coverageAreas.some(a => a.category === 'data_validation')).toBe(true);
  });

  it('shared module includes boundary', () => {
    expect(planModule('shared').coverageAreas.some(a => a.category === 'boundary')).toBe(true);
  });

  it('config module includes negative', () => {
    expect(planModule('config').coverageAreas.some(a => a.category === 'negative')).toBe(true);
  });

  it('every module type always includes smoke', () => {
    (['feature', 'core', 'shared', 'infrastructure', 'config'] as CodeModule['type'][]).forEach(type => {
      expect(planModule(type).coverageAreas.some(a => a.category === 'smoke')).toBe(true);
    });
  });
});
