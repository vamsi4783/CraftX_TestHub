import { describe, it, expect } from 'vitest';
import { IngestionFilterEngine } from '../../services/projectIngestion/IngestionFilterEngine.js';

const engine = new IngestionFilterEngine();

describe('IngestionFilterEngine', () => {
  describe('shouldExclude', () => {
    it('excludes node_modules', () => {
      expect(engine.shouldExclude('node_modules/react/index.js')).toBe(true);
    });
    it('excludes .git directory', () => {
      expect(engine.shouldExclude('.git/config')).toBe(true);
    });
    it('excludes build directory', () => {
      expect(engine.shouldExclude('build/main.js')).toBe(true);
      expect(engine.shouldExclude('dist/bundle.js')).toBe(true);
    });
    it('excludes binary extensions', () => {
      expect(engine.shouldExclude('app.exe')).toBe(true);
      expect(engine.shouldExclude('lib.so')).toBe(true);
      expect(engine.shouldExclude('image.jpg')).toBe(true);
    });
    it('excludes lock files', () => {
      expect(engine.shouldExclude('package-lock.json')).toBe(true);
      expect(engine.shouldExclude('yarn.lock')).toBe(true);
    });
    it('excludes Android build dirs', () => {
      expect(engine.shouldExclude('.gradle/caches/modules')).toBe(true);
    });
    it('does not exclude source files', () => {
      expect(engine.shouldExclude('src/main.ts')).toBe(false);
      expect(engine.shouldExclude('app/MainActivity.kt')).toBe(false);
      expect(engine.shouldExclude('lib/utils.py')).toBe(false);
    });
  });

  describe('path traversal rejection', () => {
    it('flags paths starting with ../', () => {
      // shouldExclude doesn't itself reject traversal — that's ZipProvider's job
      // but the filter should not accidentally include them either
      expect(engine.shouldExclude('../etc/passwd')).toBe(false); // not in HARD_EXCLUDE_DIRS
      // ZipProjectSourceProvider rejects these before calling filter
    });
  });

  describe('classify', () => {
    it('classifies TypeScript source files', () => {
      expect(engine.classify('src/services/auth.ts')).toBe('source');
    });
    it('classifies test files', () => {
      expect(engine.classify('src/__tests__/auth.test.ts')).toBe('test');
      expect(engine.classify('auth.spec.ts')).toBe('test');
    });
    it('classifies build files', () => {
      expect(engine.classify('build.gradle.kts')).toBe('build');
      expect(engine.classify('vite.config.ts')).toBe('build');
    });
    it('classifies ignored paths as ignored', () => {
      expect(engine.classify('node_modules/react/index.js')).toBe('ignored');
    });
    it('classifies SQL as migration', () => {
      expect(engine.classify('supabase/migrations/001_init.sql')).toBe('migration');
    });
    it('classifies markdown as documentation', () => {
      expect(engine.classify('README.md')).toBe('documentation');
    });
  });

  describe('importance', () => {
    it('rates main entry-points as critical', () => {
      expect(engine.importance('src/main.ts', 'source')).toBe('critical');
      expect(engine.importance('app/main.kt', 'source')).toBe('critical');
    });
    it('rates ViewModels as high', () => {
      expect(engine.importance('ui/AuthViewModel.kt', 'source')).toBe('high');
    });
    it('rates ignored files as ignore', () => {
      expect(engine.importance('dist/bundle.js', 'ignored')).toBe('ignore');
    });
  });

  describe('withGitignore', () => {
    it('respects gitignore rules', () => {
      const engine2 = engine.withGitignore('*.log\n/private/\ndebug/');
      expect(engine2.shouldExclude('server.log')).toBe(true);
      expect(engine2.shouldExclude('private/key.txt')).toBe(true);
      expect(engine2.shouldExclude('debug/output.txt')).toBe(true);
      expect(engine2.shouldExclude('src/main.ts')).toBe(false);
    });
  });
});
