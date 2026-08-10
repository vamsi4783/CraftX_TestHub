import { describe, it, expect } from 'vitest';
import { ProjectKnowledgeBuilder } from '../../services/projectIngestion/ProjectKnowledgeBuilder.js';
import type { ProjectFileMetadata } from '../../services/projectIngestion/types.js';
import type { ProjectStructure } from '../../services/projectIngestion/ProjectStructureAnalyzer.js';

const builder = new ProjectKnowledgeBuilder();

const emptyStructure: ProjectStructure = {
  projectType: 'web',
  primaryLanguage: 'TypeScript',
  languages: ['TypeScript'],
  frameworks: [],
  buildSystem: null,
  testFrameworks: [],
  architectureStyle: null,
  codeModules: [],
  entryPoints: [],
  dependencies: [],
  configFiles: [],
  existingTestPaths: [],
  languageStats: {},
};

function makeFile(path: string): ProjectFileMetadata {
  return {
    path,
    hash: 'abc123',
    extension: path.split('.').pop() ?? '',
    sizeBytes: 100,
    isBinary: false,
    isSensitive: false,
    isIgnored: false,
    isTest: false,
    category: 'source',
    importance: 'medium',
  };
}

describe('ProjectKnowledgeBuilder — M15 name extraction', () => {
  it('extracts name from package.json', () => {
    const files = [makeFile('package.json')];
    const contents = [{ path: 'package.json', content: JSON.stringify({ name: 'shopflow-app', version: '1.0.0' }) }];
    const result = builder.buildKnowledge('pid', 'sid', 'Fallback Name', files, contents, emptyStructure);
    expect(result.name).toBe('shopflow app');
  });

  it('strips scoped package prefix (@org/name)', () => {
    const files = [makeFile('package.json')];
    const contents = [{ path: 'package.json', content: JSON.stringify({ name: '@myorg/my-app' }) }];
    const result = builder.buildKnowledge('pid', 'sid', 'Fallback', files, contents, emptyStructure);
    expect(result.name).toBe('my app');
  });

  it('falls back to README H1 when no package.json', () => {
    const files = [makeFile('README.md')];
    const contents = [{ path: 'README.md', content: '# ShopFlow\n\nA sample project.' }];
    const result = builder.buildKnowledge('pid', 'sid', 'Fallback', files, contents, emptyStructure);
    expect(result.name).toBe('ShopFlow');
  });

  it('prefers package.json over README', () => {
    const files = [makeFile('package.json'), makeFile('README.md')];
    const contents = [
      { path: 'package.json', content: JSON.stringify({ name: 'pkg-name' }) },
      { path: 'README.md', content: '# ReadmeName' },
    ];
    const result = builder.buildKnowledge('pid', 'sid', 'Fallback', files, contents, emptyStructure);
    expect(result.name).toBe('pkg name');
  });

  it('falls back to projectName when no package.json or README', () => {
    const result = builder.buildKnowledge('pid', 'sid', 'My Project', [], [], emptyStructure);
    expect(result.name).toBe('My Project');
  });

  it('falls back to projectName when package.json has no name field', () => {
    const files = [makeFile('package.json')];
    const contents = [{ path: 'package.json', content: JSON.stringify({ version: '1.0.0' }) }];
    const result = builder.buildKnowledge('pid', 'sid', 'My Project', files, contents, emptyStructure);
    expect(result.name).toBe('My Project');
  });

  it('handles malformed package.json gracefully', () => {
    const files = [makeFile('package.json')];
    const contents = [{ path: 'package.json', content: '{ invalid json' }];
    const result = builder.buildKnowledge('pid', 'sid', 'My Project', files, contents, emptyStructure);
    expect(result.name).toBe('My Project');
  });
});

describe('ProjectKnowledgeBuilder — uncovered modules', () => {
  it('marks modules without test files as uncovered', () => {
    const structure: ProjectStructure = {
      ...emptyStructure,
      codeModules: [
        { id: 'auth', name: 'auth', path: 'src/auth', type: 'feature', fileCount: 3, testCount: 0, filePaths: ['src/auth/AuthService.ts'] },
        { id: 'cart', name: 'cart', path: 'src/cart', type: 'feature', fileCount: 2, testCount: 1, filePaths: ['src/cart/CartService.ts'] },
      ],
    };
    const result = builder.buildKnowledge('pid', 'sid', 'P', [], [], structure);
    expect(result.uncoveredModules).toContain('auth');
    expect(result.uncoveredModules).not.toContain('cart');
  });

  it('coverageScore is 0 when no modules', () => {
    const result = builder.buildKnowledge('pid', 'sid', 'P', [], [], emptyStructure);
    expect(result.coverageScore).toBe(0);
  });
});
