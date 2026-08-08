import { describe, it, expect } from 'vitest';
import { ProjectStructureAnalyzer } from '../../services/projectIngestion/ProjectStructureAnalyzer.js';
import type { ProjectFileMetadata } from '../../services/projectIngestion/types.js';

function makeFile(path: string, overrides: Partial<ProjectFileMetadata> = {}): ProjectFileMetadata {
  const ext = path.split('.').pop() ?? '';
  return {
    path,
    name:        path.split('/').pop() ?? '',
    extension:   ext,
    language:    'TypeScript',
    sizeBytes:   100,
    hash:        'abc123',
    category:    'source',
    importance:  'medium',
    isGenerated: false,
    isBinary:    false,
    isIgnored:   false,
    isTest:      path.includes('.test.') || path.includes('.spec.'),
    isSensitive: false,
    ...overrides,
  };
}

const analyzer = new ProjectStructureAnalyzer();

describe('ProjectStructureAnalyzer', () => {
  it('detects TypeScript/React project', () => {
    const files = [
      makeFile('src/App.tsx'),
      makeFile('src/main.tsx'),
      makeFile('vite.config.ts', { category: 'build' }),
      makeFile('package.json', { category: 'config' }),
    ];
    const packageJson = [{ path: 'package.json', content: JSON.stringify({
      dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
      devDependencies: { typescript: '^5.0.0', vite: '^5.0.0' },
    }), hash: 'x', sizeBytes: 200 }];
    const structure = analyzer.analyze(files, packageJson);
    expect(structure.primaryLanguage).toBe('TypeScript');
    expect(structure.frameworks).toContain('React');
    expect(structure.buildSystem).toBe('npm/Node');
    expect(structure.dependencies.some(d => d.name === 'react')).toBe(true);
  });

  it('detects Android project', () => {
    const files = [
      makeFile('app/src/main/java/com/test/MainActivity.kt', { language: 'Kotlin', category: 'source' }),
      makeFile('build.gradle.kts', { category: 'build', language: 'Kotlin' }),
      makeFile('settings.gradle.kts', { category: 'build', language: 'Kotlin' }),
    ];
    const gradle = [{ path: 'build.gradle.kts', content: [
      'dependencies {',
      '  implementation("io.insert-koin:koin-android:3.2.0")',
      '  implementation("com.squareup.retrofit2:retrofit:2.9.0")',
      '}',
    ].join('\n'), hash: 'x', sizeBytes: 100 }];
    const structure = analyzer.analyze(files, gradle);
    expect(structure.buildSystem).toBe('Gradle');
    expect(structure.dependencies.some(d => d.name.includes('retrofit'))).toBe(true);
  });

  it('groups files into modules', () => {
    const files = [
      makeFile('src/auth/LoginScreen.tsx'),
      makeFile('src/auth/AuthViewModel.ts'),
      makeFile('src/payment/PaymentScreen.tsx'),
      makeFile('src/payment/PaymentService.ts'),
      makeFile('src/utils/helpers.ts'),
    ];
    const structure = analyzer.analyze(files, []);
    const moduleNames = structure.codeModules.map(m => m.name);
    expect(moduleNames).toContain('auth');
    expect(moduleNames).toContain('payment');
  });

  it('detects test files', () => {
    const files = [
      makeFile('src/auth/login.ts'),
      makeFile('src/auth/login.test.ts', { isTest: true, category: 'test' }),
      makeFile('src/auth/auth.spec.ts',  { isTest: true, category: 'test' }),
    ];
    const structure = analyzer.analyze(files, []);
    expect(structure.existingTestPaths.length).toBe(2);
  });

  it('detects entry points', () => {
    const files = [
      makeFile('src/main.ts', { importance: 'critical' }),
      makeFile('src/utils.ts'),
    ];
    const structure = analyzer.analyze(files, []);
    expect(structure.entryPoints.some(ep => ep.path === 'src/main.ts')).toBe(true);
  });
});
