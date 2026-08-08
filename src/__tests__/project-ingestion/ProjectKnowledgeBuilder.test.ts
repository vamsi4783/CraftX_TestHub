import { describe, it, expect } from 'vitest';
import { ProjectKnowledgeBuilder } from '../../services/projectIngestion/ProjectKnowledgeBuilder.js';
import type { ProjectFileMetadata } from '../../services/projectIngestion/types.js';
import type { ProjectStructure } from '../../services/projectIngestion/ProjectStructureAnalyzer.js';

function makeFile(path: string, extra: Partial<ProjectFileMetadata> = {}): ProjectFileMetadata {
  return {
    path,
    name:        path.split('/').pop() ?? '',
    extension:   path.split('.').pop() ?? '',
    language:    'TypeScript',
    sizeBytes:   200,
    hash:        'abc',
    category:    'source',
    importance:  'medium',
    isGenerated: false,
    isBinary:    false,
    isIgnored:   false,
    isTest:      false,
    isSensitive: false,
    ...extra,
  };
}

function makeStructure(): ProjectStructure {
  return {
    projectType:       'React/Web',
    languages:         ['TypeScript'],
    primaryLanguage:   'TypeScript',
    frameworks:        ['React'],
    architectureStyle: null,
    buildSystem:       'npm/Node',
    testFrameworks:    ['Vitest'],
    codeModules:       [],
    entryPoints:       [],
    dependencies:      [],
    configFiles:       [],
    existingTestPaths: [],
    languageStats:     { TypeScript: 3 },
  };
}

const builder = new ProjectKnowledgeBuilder();

describe('ProjectKnowledgeBuilder', () => {
  it('builds basic knowledge with correct stats', () => {
    const files = [
      makeFile('src/main.ts'),
      makeFile('src/utils.ts'),
      makeFile('src/utils.test.ts', { isTest: true }),
      makeFile('private.env', { isSensitive: true, isIgnored: true }),
    ];
    const knowledge = builder.buildKnowledge(
      'proj-1', 'src-1', 'MyApp', files, [], makeStructure(),
    );
    expect(knowledge.projectId).toBe('proj-1');
    expect(knowledge.name).toBe('MyApp');
    expect(knowledge.totalFiles).toBe(4);
    expect(knowledge.sensitiveFiles).toBe(1);
  });

  it('excludes sensitive files from fileSummaries', () => {
    const files = [
      makeFile('src/main.ts'),
      makeFile('.env', { isSensitive: true }),
    ];
    const contents = [
      { path: 'src/main.ts', content: 'export function main() {}', hash: 'x', sizeBytes: 100 },
      { path: '.env',        content: 'API_KEY=secret', hash: 'y', sizeBytes: 20 },
    ];
    const knowledge = builder.buildKnowledge(
      'proj-1', 'src-1', 'MyApp', files, contents, makeStructure(),
    );
    const paths = knowledge.fileSummaries.map(f => f.path);
    expect(paths).toContain('src/main.ts');
    expect(paths).not.toContain('.env');
  });

  it('extracts symbols from TypeScript', () => {
    const files = [ makeFile('src/auth.ts') ];
    const contents = [{
      path: 'src/auth.ts',
      content: 'export function login() {}\nexport class AuthService {}',
      hash: 'x',
      sizeBytes: 100,
    }];
    const knowledge = builder.buildKnowledge(
      'proj-1', 'src-1', 'MyApp', files, contents, makeStructure(),
    );
    const summary = knowledge.fileSummaries.find(f => f.path === 'src/auth.ts');
    expect(summary).toBeDefined();
    expect(summary!.symbols).toContain('AuthService');
  });

  it('computes coverage score correctly', () => {
    const structure = makeStructure();
    structure.codeModules = [
      { id: 'mod-1', name: 'auth', path: 'src/auth', filePaths: ['src/auth/login.ts'], description: '', type: 'feature', dependsOn: [], fileCount: 1, testCount: 1 },
      { id: 'mod-2', name: 'utils', path: 'src/utils', filePaths: ['src/utils/helpers.ts'], description: '', type: 'shared', dependsOn: [], fileCount: 1, testCount: 0 },
    ];
    const files = [
      makeFile('src/auth/login.ts'),
      makeFile('src/auth/login.test.ts', { isTest: true }),
      makeFile('src/utils/helpers.ts'),
    ];
    const knowledge = builder.buildKnowledge('p', 's', 'App', files, [], structure);
    expect(knowledge.coverageScore).toBeGreaterThan(0);
    expect(knowledge.coverageScore).toBeLessThanOrEqual(1);
  });
});
