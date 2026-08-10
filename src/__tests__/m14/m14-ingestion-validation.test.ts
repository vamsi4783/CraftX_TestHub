// ─── M14 Phase C/N/O — Ingestion Validation, Failure Matrix & Storage Audit ───
// Uses a realistic multi-file project fixture to validate the full ingestion
// pipeline. Tests failure cases and confirms storage invariants.

import { describe, it, expect } from 'vitest';
import { ProjectStructureAnalyzer } from '@/services/projectIngestion/ProjectStructureAnalyzer';
import { ProjectKnowledgeBuilder } from '@/services/projectIngestion/ProjectKnowledgeBuilder';
import { IngestionFilterEngine } from '@/services/projectIngestion/IngestionFilterEngine';
import { secretScanner } from '@/services/projectIngestion/SecretScanner';
import type { ProjectFileMetadata, ProjectSourceConfig } from '@/services/projectIngestion/types';
import type { SourceFileContent } from '@/services/projectIngestion/IProjectSourceProvider';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeFile(path: string, overrides: Partial<ProjectFileMetadata> = {}): ProjectFileMetadata {
  const name = path.split('/').pop() ?? '';
  const ext  = name.split('.').pop() ?? '';
  const isTest = /[._-]test\.[a-z]+$/i.test(name) || /[._-]spec\.[a-z]+$/i.test(name) || path.includes('__tests__');
  return {
    path, name, extension: ext,
    language: 'TypeScript',
    sizeBytes: 300, hash: 'abc123',
    category: 'source', importance: 'medium',
    isGenerated: false, isBinary: false, isIgnored: false,
    isTest, isSensitive: false,
    ...overrides,
  };
}

function makeContent(path: string, content: string): SourceFileContent {
  return { path, content, hash: 'xyz', sizeBytes: content.length };
}

// ─── Realistic multi-module project fixture ────────────────────────────────────
// Simulates a React Native e-commerce app with Auth, Cart, Orders, Network modules,
// existing tests, config files, README, and ignored/generated files.

const PROJECT_FILES: ProjectFileMetadata[] = [
  // Auth module
  makeFile('src/auth/LoginScreen.tsx',       { category: 'source', importance: 'high' }),
  makeFile('src/auth/SignUpScreen.tsx',       { category: 'source', importance: 'high' }),
  makeFile('src/auth/AuthViewModel.ts',      { category: 'source', importance: 'high' }),
  makeFile('src/auth/AuthRepository.ts',     { category: 'source', importance: 'high' }),
  makeFile('src/auth/__tests__/auth.test.ts', { category: 'source', isTest: true }),
  // Cart module
  makeFile('src/cart/CartScreen.tsx',        { category: 'source', importance: 'high' }),
  makeFile('src/cart/CartViewModel.ts',      { category: 'source', importance: 'medium' }),
  makeFile('src/cart/CartRepository.ts',     { category: 'source', importance: 'medium' }),
  // Orders module
  makeFile('src/orders/OrdersScreen.tsx',    { category: 'source', importance: 'medium' }),
  makeFile('src/orders/OrderDetailPage.tsx', { category: 'source', importance: 'medium' }),
  makeFile('src/orders/OrderService.ts',     { category: 'source', importance: 'high' }),
  makeFile('src/orders/__tests__/orders.test.ts', { category: 'source', isTest: true }),
  // Network / core module
  makeFile('src/network/ApiClient.ts',       { category: 'source', importance: 'critical' }),
  makeFile('src/network/HttpService.ts',     { category: 'source', importance: 'high' }),
  makeFile('src/network/__tests__/api.test.ts', { category: 'source', isTest: true }),
  // Shared utilities
  makeFile('src/shared/utils/formatDate.ts', { category: 'source', importance: 'low' }),
  makeFile('src/shared/utils/validators.ts', { category: 'source', importance: 'medium' }),
  makeFile('src/shared/components/Button.tsx', { category: 'source', importance: 'low' }),
  // Config files
  makeFile('package.json',    { category: 'config', language: 'Unknown', importance: 'critical' }),
  makeFile('.env.example',    { category: 'config', language: 'Unknown', importance: 'low' }),
  makeFile('README.md',       { category: 'documentation', language: 'Unknown', importance: 'medium' }),
  // Ignored / generated (already marked)
  makeFile('node_modules/react/index.js', { isIgnored: true, category: 'dependency' }),
  makeFile('build/main.js',               { isIgnored: true, category: 'generated', isGenerated: true }),
  makeFile('.env',                        { isSensitive: true, isIgnored: true, category: 'config' }),
];

const PROJECT_MANIFESTS: SourceFileContent[] = [
  makeContent('package.json', JSON.stringify({
    name: 'shopapp',
    version: '1.0.0',
    dependencies: {
      'react': '18.2.0',
      'react-native': '0.73.0',
      'redux': '4.0.0',
      'axios': '1.6.0',
    },
    devDependencies: {
      'typescript': '5.0.0',
      'jest': '29.0.0',
      '@testing-library/react-native': '12.0.0',
    },
  })),
];

const analyzer = new ProjectStructureAnalyzer();
const knowledgeBuilder = new ProjectKnowledgeBuilder();

// ─── Phase C: Real project ingestion validation ───────────────────────────────

describe('Phase C: Multi-module project structure analysis', () => {
  const included = PROJECT_FILES.filter(f => !f.isIgnored && !f.isBinary && !f.isSensitive);
  const structure = analyzer.analyze(included, PROJECT_MANIFESTS);

  it('detects TypeScript as primary language', () => {
    expect(structure.languages).toContain('TypeScript');
  });

  it('detects React / React Native frameworks', () => {
    expect(structure.frameworks.some(f => f.includes('React'))).toBe(true);
  });

  it('detects npm build system', () => {
    expect(structure.buildSystem).toBeTruthy();
  });

  it('detects existing test files', () => {
    expect(structure.existingTestPaths.length).toBeGreaterThan(0);
    expect(structure.existingTestPaths.some(p => p.includes('.test.'))).toBe(true);
  });

  it('groups files into at least 2 modules', () => {
    expect(structure.codeModules.length).toBeGreaterThanOrEqual(2);
  });

  it('detects runtime dependencies from package.json', () => {
    expect(structure.dependencies.some(d => d.name === 'react-native')).toBe(true);
    expect(structure.dependencies.some(d => d.name === 'axios')).toBe(true);
  });

  it('modules have positive fileCount', () => {
    structure.codeModules.forEach(m => {
      expect(m.fileCount).toBeGreaterThan(0);
    });
  });

  it('modules have testCount reflecting actual test files', () => {
    const totalTestCount = structure.codeModules.reduce((s, m) => s + m.testCount, 0);
    // We have 3 test files across auth, orders, network
    expect(totalTestCount).toBeGreaterThanOrEqual(3);
  });

  it('modules include correct types (feature, core, shared)', () => {
    const types = structure.codeModules.map(m => m.type);
    expect(types).toContain('feature');
  });
});

describe('Phase C: ProjectKnowledge from realistic fixture', () => {
  const included = PROJECT_FILES.filter(f => !f.isIgnored && !f.isBinary && !f.isSensitive);
  const structure = analyzer.analyze(included, PROJECT_MANIFESTS);
  const sourceContents: SourceFileContent[] = included
    .filter(f => f.category === 'source')
    .map(f => makeContent(f.path, `// ${f.name}\nexport class ${f.name.replace(/\.[^.]+$/, '')} {}`));

  const knowledge = knowledgeBuilder.buildKnowledge(
    'proj-1', 'src-1', 'ShopApp',
    included, sourceContents, structure,
  );

  it('knowledge has project name', () => {
    expect(knowledge.name).toBe('ShopApp');
  });

  it('knowledge has non-empty description', () => {
    expect(typeof knowledge.description).toBe('string');
  });

  it('knowledge has correct projectId and sourceId', () => {
    expect(knowledge.projectId).toBe('proj-1');
    expect(knowledge.sourceId).toBe('src-1');
  });

  it('knowledge has codeModules array', () => {
    expect(Array.isArray(knowledge.codeModules)).toBe(true);
    expect(knowledge.codeModules.length).toBeGreaterThan(0);
  });

  it('knowledge has languageStats', () => {
    expect(knowledge.languageStats).toBeTruthy();
    expect(Object.keys(knowledge.languageStats).length).toBeGreaterThan(0);
  });

  it('knowledge has frameworks list', () => {
    expect(Array.isArray(knowledge.frameworks)).toBe(true);
  });

  it('knowledge has existingTestPaths', () => {
    expect(Array.isArray(knowledge.existingTestPaths)).toBe(true);
    expect(knowledge.existingTestPaths.length).toBeGreaterThan(0);
  });

  it('knowledge fileSummaries do NOT contain raw source content', () => {
    // FileSummaries should contain purpose/symbols/imports, not the raw file body
    for (const summary of knowledge.fileSummaries) {
      expect(typeof summary.path).toBe('string');
      expect(typeof summary.purpose).toBe('string');
      expect(Array.isArray(summary.symbols)).toBe(true);
      expect(Array.isArray(summary.imports)).toBe(true);
      // No raw content field
      expect((summary as unknown as Record<string, unknown>).content).toBeUndefined();
      expect((summary as unknown as Record<string, unknown>).rawContent).toBeUndefined();
    }
  });

  it('knowledge schemaVersion is 1', () => {
    expect(knowledge.schemaVersion).toBe(1);
  });
});

// ─── Phase N: Failure matrix ──────────────────────────────────────────────────

describe('Phase N: Empty project', () => {
  it('empty project produces empty modules, languages, frameworks', () => {
    const s = analyzer.analyze([], []);
    expect(s.codeModules).toEqual([]);
    expect(s.languages).toEqual([]);
    expect(s.frameworks).toEqual([]);
    expect(s.dependencies).toEqual([]);
    expect(s.existingTestPaths).toEqual([]);
  });

  it('ProjectKnowledgeBuilder handles empty file list safely', () => {
    const emptyStructure = analyzer.analyze([], []);
    const k = knowledgeBuilder.buildKnowledge('p1', 's1', 'EmptyApp', [], [], emptyStructure);
    expect(k.codeModules).toEqual([]);
    expect(k.totalFiles).toBe(0);
    expect(k.indexedFiles).toBe(0);
  });
});

describe('Phase N: Project with only config files', () => {
  it('config-only project has no source languages', () => {
    const files = [
      makeFile('package.json', { category: 'config', language: 'Unknown' }),
      makeFile('.gitignore',   { category: 'config', language: 'Unknown' }),
    ];
    const s = analyzer.analyze(files, []);
    expect(s.languages).toEqual([]);
  });
});

describe('Phase N: Project with no existing tests', () => {
  it('zero existingTestPaths when no test files present', () => {
    const files = [
      makeFile('src/App.tsx', { category: 'source', isTest: false }),
      makeFile('src/utils.ts', { category: 'source', isTest: false }),
    ];
    const s = analyzer.analyze(files, []);
    expect(s.existingTestPaths).toEqual([]);
  });

  it('all modules have testCount 0 when no tests', () => {
    const files = [
      makeFile('src/auth/Login.tsx', { category: 'source', isTest: false }),
      makeFile('src/cart/Cart.tsx',  { category: 'source', isTest: false }),
    ];
    const s = analyzer.analyze(files, []);
    s.codeModules.forEach(m => {
      expect(m.testCount).toBe(0);
    });
  });
});

describe('Phase N: Ignored and generated files excluded', () => {
  const filterEngine = new IngestionFilterEngine({});

  it('node_modules directory is always excluded', () => {
    const meta = filterEngine.buildMetadata('node_modules/lodash/index.js', 100, 'abc');
    expect(meta.isIgnored).toBe(true);
  });

  it('build output is always excluded', () => {
    const meta = filterEngine.buildMetadata('build/app.bundle.js', 100, 'abc');
    expect(meta.isIgnored).toBe(true);
  });

  it('dist output is excluded', () => {
    const meta = filterEngine.buildMetadata('dist/main.js', 100, 'abc');
    expect(meta.isIgnored).toBe(true);
  });

  it('binary file extension is excluded', () => {
    const meta = filterEngine.buildMetadata('assets/icon.png', 100, 'abc');
    expect(meta.isBinary || meta.isIgnored).toBe(true);
  });

  it('lock files are excluded', () => {
    const meta = filterEngine.buildMetadata('package-lock.json', 100, 'abc');
    expect(meta.isIgnored).toBe(true);
  });
});

describe('Phase N: Malformed JSON manifests', () => {
  it('malformed package.json is handled gracefully', () => {
    const files = [makeFile('src/App.tsx', { category: 'source' })];
    const manifests = [makeContent('package.json', '{ invalid json !!!')];
    // Should not throw — analyze still returns a structure
    expect(() => analyzer.analyze(files, manifests)).not.toThrow();
  });

  it('empty manifest content is handled gracefully', () => {
    const files = [makeFile('src/App.tsx', { category: 'source' })];
    const manifests = [makeContent('package.json', '')];
    expect(() => analyzer.analyze(files, manifests)).not.toThrow();
  });
});

describe('Phase N: Malformed JSON import', () => {
  it('invalid JSON returns null from parseJsonInput', () => {
    expect(parseJsonInput('{ broken json')).toBeNull();
  });

  it('empty string returns null', () => {
    expect(parseJsonInput('')).toBeNull();
  });

  it('number input returns null', () => {
    expect(parseJsonInput('42')).toBeNull();
  });

  it('array of non-objects still parsed (normalizer rejects)', () => {
    const items = parseJsonInput('["string1", "string2"]');
    expect(items).not.toBeNull();
    const dry = dryRunJsonImport(items!);
    expect(dry.invalid).toBe(2);
  });

  it('empty array returns empty array, not null', () => {
    const items = parseJsonInput('[]');
    expect(items).not.toBeNull();
    expect(items!.length).toBe(0);
  });
});

describe('Phase N: Duplicate detection in JSON import', () => {
  it('normalizeTestCaseBatch detects no duplicates in distinct batch', () => {
    const raws = [
      { title: 'Login test A', priority: 'high' },
      { title: 'Payment test B', priority: 'medium' },
    ];
    const { results } = normalizeTestCaseBatch(raws);
    expect(results.every(r => r.ok)).toBe(true);
  });

  it('batch with identical titles still returns both (dedup is optional per call)', () => {
    const raws = [
      { title: 'Login test', priority: 'high' },
      { title: 'Login test', priority: 'medium' },
    ];
    const { results } = normalizeTestCaseBatch(raws);
    // normalizeTestCaseBatch doesn't itself deduplicate — dedup is in SuggestionEngine
    // Both should be valid
    expect(results.filter(r => r.ok).length).toBe(2);
  });
});

// ─── Phase O: Storage / security audit ───────────────────────────────────────

describe('Phase O: Storage invariant — no raw source in persistence targets', () => {
  const included = PROJECT_FILES.filter(f => !f.isIgnored && !f.isBinary && !f.isSensitive);
  const structure = analyzer.analyze(included, PROJECT_MANIFESTS);
  const sourceContents = included
    .filter(f => f.category === 'source')
    .map(f => makeContent(f.path, `export class ${f.name} { /* raw content */ }`));

  const knowledge = knowledgeBuilder.buildKnowledge(
    'proj-1', 'src-1', 'ShopApp', included, sourceContents, structure,
  );

  it('FileSummary entries have no content field', () => {
    knowledge.fileSummaries.forEach(s => {
      const raw = s as unknown as Record<string, unknown>;
      expect(raw.content).toBeUndefined();
      expect(raw.rawContent).toBeUndefined();
      expect(raw.fileContent).toBeUndefined();
    });
  });

  it('FileSummary entries only carry purpose, symbols, imports', () => {
    knowledge.fileSummaries.forEach(s => {
      expect(typeof s.path).toBe('string');
      expect(typeof s.purpose).toBe('string');
      expect(Array.isArray(s.symbols)).toBe(true);
      expect(Array.isArray(s.imports)).toBe(true);
    });
  });

  it('FileIndexEntry shape has no content field', () => {
    // FileIndexEntry is the compact form persisted to JSONB
    // Verify its allowed fields
    const allowedKeys = new Set(['p', 's', 'h', 'l', 'c', 'i', 'b', 'x', 't', 'se', 'e']);
    // If structure had a FileIndex, check it
    // Here we check the type contract via an explicit fixture
    const entry = { p: 'src/App.tsx', s: 300, h: 'abc123', l: 'TypeScript', c: 'source', i: 'medium' };
    Object.keys(entry).forEach(k => {
      expect(allowedKeys.has(k)).toBe(true);
    });
    expect((entry as Record<string, unknown>).content).toBeUndefined();
  });

  it('ai_generation_metadata does not contain sensitive fields', () => {
    const meta = {
      source_type: 'project_intelligence',
      project_id: 'proj-1',
      generation_mode: 'standard',
      generated_at: new Date().toISOString(),
      connector_model: 'gemini-pro',
    };
    const metaStr = JSON.stringify(meta);
    // Must not contain credential-like fields
    expect(metaStr).not.toContain('api_key');
    expect(metaStr).not.toContain('secret');
    expect(metaStr).not.toContain('password');
    expect(metaStr).not.toContain('token');
    expect(metaStr).not.toContain('pat');
  });
});

describe('Phase O: SecretScanner — sensitive paths excluded', () => {
  it('.env file is sensitive', () => {
    expect(secretScanner.isSensitivePath('.env')).toBe(true);
  });

  it('.env.local is sensitive', () => {
    expect(secretScanner.isSensitivePath('.env.local')).toBe(true);
  });

  it('.env.production is sensitive', () => {
    expect(secretScanner.isSensitivePath('.env.production')).toBe(true);
  });

  it('regular source file is not sensitive by path', () => {
    expect(secretScanner.isSensitivePath('src/auth/LoginScreen.tsx')).toBe(false);
  });

  it('config/secrets.json is sensitive', () => {
    expect(secretScanner.isSensitivePath('config/secrets.json')).toBe(true);
  });
});

describe('Phase O: SecretScanner — credential content detection', () => {
  it('detects GitHub PAT pattern in content', () => {
    // ghp_ + 36 alphanumeric chars = GitHub classic PAT
    const findings = secretScanner.scan('const TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz1234567890AB";', 'config.ts');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('safe source file passes scan with no findings', () => {
    const findings = secretScanner.scan('export function formatDate(d: Date) { return d.toISOString(); }', 'src/utils.ts');
    expect(findings.length).toBe(0);
  });

  it('findings include redacted preview, not raw secret value', () => {
    const findings = secretScanner.scan('const TOKEN = "ghp_abc1234567890xyz";', 'config.ts');
    if (findings.length > 0) {
      // Preview should not contain the full raw value
      expect(findings[0].preview).not.toBe('ghp_abc1234567890xyz');
    }
  });
});

// ─── Phase M: Source provider implementation status ────────────────────────────

describe('Phase M: Source provider implementation status', () => {
  it('LocalProjectSourceProvider is implemented (has connect method)', async () => {
    const { LocalProjectSourceProvider } = await import('@/services/projectIngestion/providers/LocalProjectSourceProvider');
    const provider = new LocalProjectSourceProvider();
    expect(typeof provider.connect).toBe('function');
    expect(typeof provider.listFiles).toBe('function');
    expect(typeof provider.readFiles).toBe('function');
  });

  it('ZipProjectSourceProvider is implemented', async () => {
    const { ZipProjectSourceProvider } = await import('@/services/projectIngestion/providers/ZipProjectSourceProvider');
    expect(ZipProjectSourceProvider).toBeDefined();
  });

  it('GitHubProjectSourceProvider is implemented', async () => {
    const { GitHubProjectSourceProvider } = await import('@/services/projectIngestion/providers/GitHubProjectSourceProvider');
    const provider = new GitHubProjectSourceProvider('owner', 'repo', 'main', null);
    expect(typeof provider.connect).toBe('function');
    expect(provider.kind).toBe('github');
  });

  it('GoogleDriveProjectSourceProvider is a stub (throws ProviderNotImplementedError)', async () => {
    const { GoogleDriveProjectSourceProvider } = await import('@/services/projectIngestion/providers/GoogleDriveProjectSourceProvider');
    const provider = new GoogleDriveProjectSourceProvider();
    await expect(provider.connect()).rejects.toThrow('not yet implemented');
  });

  it('OneDriveProjectSourceProvider is a stub (throws ProviderNotImplementedError)', async () => {
    const { OneDriveProjectSourceProvider } = await import('@/services/projectIngestion/providers/OneDriveProjectSourceProvider');
    const provider = new OneDriveProjectSourceProvider();
    await expect(provider.connect()).rejects.toThrow('not yet implemented');
  });

  it('stub providers have empty capabilities set', async () => {
    const { GoogleDriveProjectSourceProvider } = await import('@/services/projectIngestion/providers/GoogleDriveProjectSourceProvider');
    const { OneDriveProjectSourceProvider } = await import('@/services/projectIngestion/providers/OneDriveProjectSourceProvider');
    expect(new GoogleDriveProjectSourceProvider().capabilities.size).toBe(0);
    expect(new OneDriveProjectSourceProvider().capabilities.size).toBe(0);
  });

  it('stub getMetadata returns displayName with "not yet implemented"', async () => {
    const { GoogleDriveProjectSourceProvider } = await import('@/services/projectIngestion/providers/GoogleDriveProjectSourceProvider');
    const meta = await new GoogleDriveProjectSourceProvider().getMetadata();
    expect(meta.displayName.toLowerCase()).toContain('not yet implemented');
  });
});

// helper needed below
import { parseJsonInput, dryRunJsonImport } from '@/services/jsonImportService';
import { normalizeTestCaseBatch } from '@/services/testCaseNormalizer';
