import { describe, it, expect } from 'vitest';
import { ProjectContextBuilder } from '../../services/projectIngestion/ProjectContextBuilder.js';
import type { ProjectKnowledge } from '../../services/projectIngestion/types.js';

function makeKnowledge(overrides: Partial<ProjectKnowledge> = {}): ProjectKnowledge {
  return {
    projectId:         'proj-1',
    sourceId:          'src-1',
    generatedAt:       '2026-08-08T00:00:00Z',
    schemaVersion:     1,
    name:              'TestApp',
    description:       'A React TypeScript app',
    purpose:           'Test application',
    languages:         ['TypeScript'],
    frameworks:        ['React'],
    buildSystem:       'npm/Node',
    testFrameworks:    ['Vitest'],
    architectureStyle: 'MVVM',
    codeModules: [
      { id: 'mod-auth', name: 'auth', path: 'src/auth', filePaths: ['src/auth/login.ts'], description: 'Auth module', type: 'feature', dependsOn: [], fileCount: 2, testCount: 1 },
      { id: 'mod-payment', name: 'payment', path: 'src/payment', filePaths: ['src/payment/pay.ts'], description: 'Payment module', type: 'feature', dependsOn: [], fileCount: 3, testCount: 0 },
    ],
    entryPoints:    [{ path: 'src/main.tsx', kind: 'main', name: 'main' }],
    dependencies:   [{ name: 'react', version: '^18', kind: 'runtime', source: 'npm' }],
    configFiles:    ['tsconfig.json'],
    existingTestPaths: ['src/auth/login.test.ts'],
    coveredModules:   ['mod-auth'],
    uncoveredModules: ['mod-payment'],
    coverageScore:    0.5,
    fileSummaries: [
      { path: 'src/auth/login.ts', hash: 'x', purpose: 'Login form', symbols: ['LoginForm', 'useLogin'], imports: ['react'], testTargets: [], moduleId: 'mod-auth', tags: ['screen', 'auth'], isSensitive: false },
      { path: 'src/payment/pay.ts', hash: 'y', purpose: 'Payment service', symbols: ['PaymentService'], imports: ['axios'], testTargets: [], moduleId: 'mod-payment', tags: ['service', 'payment'], isSensitive: false },
      { path: '.env.secret', hash: 'z', purpose: 'Secrets', symbols: [], imports: [], testTargets: [], moduleId: '', tags: [], isSensitive: true },
    ],
    totalFiles:     10,
    indexedFiles:   8,
    ignoredFiles:   2,
    sensitiveFiles: 1,
    languageStats:  { TypeScript: 8 },
    ...overrides,
  };
}

const builder = new ProjectContextBuilder();

describe('ProjectContextBuilder', () => {
  it('builds context with token estimate', () => {
    const ctx = builder.build(makeKnowledge(), { projectId: 'proj-1' });
    expect(ctx.projectName).toBe('TestApp');
    expect(ctx.tokenEstimate).toBeGreaterThan(0);
    expect(ctx.tokenEstimate).toBeLessThanOrEqual(32_000);
  });

  it('excludes sensitive files', () => {
    const ctx = builder.build(makeKnowledge(), { projectId: 'proj-1' });
    const paths = ctx.relevantFiles.map(f => f.path);
    expect(paths).not.toContain('.env.secret');
  });

  it('filters by feature keyword', () => {
    const ctx = builder.build(makeKnowledge(), { projectId: 'proj-1', feature: 'payment' });
    expect(ctx.relevantFiles.some(f => f.tags.includes('payment'))).toBe(true);
  });

  it('respects maxTokens budget', () => {
    const ctx = builder.build(makeKnowledge(), { projectId: 'proj-1', maxTokens: 1000 });
    expect(ctx.tokenEstimate).toBeLessThanOrEqual(1000);
  });

  it('serialises to prompt string', () => {
    const ctx    = builder.build(makeKnowledge(), { projectId: 'proj-1' });
    const prompt = builder.toPromptString(ctx);
    expect(prompt).toContain('TestApp');
    expect(prompt).toContain('React');
    expect(prompt).not.toContain('.env.secret');
  });

  it('includes existing tests when includeTests is true', () => {
    const ctx = builder.build(makeKnowledge(), { projectId: 'proj-1', includeTests: true });
    expect(ctx.existingTests.length).toBeGreaterThan(0);
  });
});
