// ─── M10: IngestionFilterEngine — decide which files to include/exclude ───────
// Applies default exclude rules + .gitignore + project-type-specific rules.
// Also classifies files (source, test, config, binary, etc.).

import type {
  FileCategory,
  FileImportance,
  ProjectLanguage,
  ProjectFileMetadata,
  ProjectSourceConfig,
} from './types.js';

// ─── Hard-excluded directory/file patterns (never ingested) ──────────────────

const HARD_EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg',
  'build', 'dist', 'out', 'output', 'target',
  'bin', 'obj', '.obj',
  'Library', 'Pods', 'DerivedData',
  'Temp', 'temp', 'tmp', '.tmp',
  'Logs', 'logs', '.logs',
  '.gradle', '.android', '.kotlin',
  '.dart_tool', '.pub-cache', '.pub',
  '__pycache__', '.mypy_cache', '.pytest_cache',
  '.venv', 'venv', 'env', '.env',
  '.idea', '.vscode', '.vs',
  'xcuserdata', '*.xcworkspace',
  'generated', 'gen', 'auto-generated',
  '.next', '.nuxt', '.svelte-kit',
  'coverage', '.nyc_output', '.coverage',
  'storybook-static', '.storybook-static',
]);

const HARD_EXCLUDE_EXTENSIONS = new Set([
  // Binaries
  'exe','dll','so','dylib','a','lib','o','class','dex','aar','apk','ipa',
  'wasm','bin','img','iso','dmg','msi','pkg','deb','rpm',
  // Compiled/generated
  'pyc','pyo','pyd','class','jar','war','ear','min.js','min.css',
  // Media (unless explicitly included)
  'jpg','jpeg','png','gif','bmp','ico','svg','webp','tiff','tif',
  'mp3','mp4','wav','ogg','flac','avi','mov','wmv','mkv',
  'ttf','otf','woff','woff2','eot',
  // Archives
  'zip','tar','gz','bz2','xz','7z','rar','cab',
  // DB files
  'sqlite','db','mdb','accdb',
  // OS files
  'DS_Store','Thumbs.db',
]);

const HARD_EXCLUDE_FILES = new Set([
  '.DS_Store', 'Thumbs.db', '.gitkeep', '.gitattributes',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'Podfile.lock', 'Gemfile.lock', 'composer.lock', 'cargo.lock',
]);

// ─── Language map ─────────────────────────────────────────────────────────────

const EXT_TO_LANGUAGE: Record<string, ProjectLanguage> = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  kt: 'Kotlin', kts: 'Kotlin',
  java: 'Java',
  swift: 'Swift',
  dart: 'Dart',
  py: 'Python', pyw: 'Python',
  cs: 'CSharp',
  go: 'Go',
  rs: 'Rust',
  rb: 'Ruby',
  php: 'PHP',
};

// ─── Category classification ──────────────────────────────────────────────────

const TEST_PATTERNS = [
  /[._-]test\.[a-z]+$/i,
  /[._-]spec\.[a-z]+$/i,
  /\.test$/i, /\.spec$/i,
  /^test_/i,
  /\/tests?\//i, /\/__tests__\//i,
  /\/specs?\//i,
  /Test\.kt$/i, /Tests\.kt$/i,
  /Test\.java$/i, /Tests\.java$/i,
  /UITest/i, /InstrumentedTest/i,
  /XCTest/i,
];

const GENERATED_PATTERNS = [
  /\.generated\./i, /Generated\./i,
  /\.min\.[a-z]+$/i,
  /\.pb\.swift$/i, /\.pb\.go$/i,
  /\.g\.dart$/i, /\.freezed\.dart$/i,
  /BuildConfig\.java$/i,
  /R\.java$/i,
  /binding\.[a-z]+$/i,
];

const CONFIG_EXTENSIONS = new Set([
  'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'config',
  'properties', 'env', 'xml', 'plist',
]);

const BUILD_FILES = new Set([
  'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts',
  'CMakeLists.txt', 'Makefile', 'makefile', 'Rakefile', 'Fastfile',
  'Podfile', 'Package.swift', 'pubspec.yaml', 'pom.xml',
  'webpack.config.js', 'vite.config.ts', 'vite.config.js',
  'rollup.config.js', 'esbuild.config.js', 'tsconfig.json',
  'jest.config.js', 'jest.config.ts', 'vitest.config.ts',
  '.babelrc', 'babel.config.js', 'babel.config.ts',
  '.eslintrc', '.eslintrc.js', '.eslintrc.json',
]);

const IMPORTANT_ROOT_FILES = new Set([
  'package.json', 'pubspec.yaml', 'build.gradle', 'build.gradle.kts',
  'pom.xml', 'CMakeLists.txt', 'Cargo.toml', 'go.mod', 'requirements.txt',
  'setup.py', 'pyproject.toml', 'Gemfile', 'composer.json',
  'AndroidManifest.xml', 'Info.plist', 'AppDelegate.swift',
  'MainActivity.kt', 'MainActivity.java', 'App.tsx', 'App.ts',
  'index.ts', 'index.tsx', 'main.ts', 'main.tsx', 'main.kt', 'main.py',
  'server.ts', 'server.js', 'app.ts', 'app.js',
  'Program.cs', 'Startup.cs',
]);

// ─── IngestionFilterEngine ────────────────────────────────────────────────────

export class IngestionFilterEngine {
  private readonly ignorePatterns: RegExp[];

  constructor(
    private readonly config: ProjectSourceConfig = {},
    extraIgnoreLines: string[] = [],
  ) {
    this.ignorePatterns = this._compileIgnorePatterns(extraIgnoreLines);
  }

  /**
   * Parse a .gitignore file content and return a new engine that also
   * respects those rules.
   */
  withGitignore(content: string): IngestionFilterEngine {
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    return new IngestionFilterEngine(this.config, [
      ...(this.config.extraIgnorePatterns ?? []),
      ...lines,
    ]);
  }

  /** True if this file path should be excluded from ingestion. */
  shouldExclude(path: string): boolean {
    const segments = path.split('/');
    const filename  = segments[segments.length - 1];
    const ext       = this._ext(filename);

    // Hard excludes
    for (const seg of segments) {
      if (HARD_EXCLUDE_DIRS.has(seg)) return true;
    }
    if (HARD_EXCLUDE_EXTENSIONS.has(ext)) return true;
    if (HARD_EXCLUDE_FILES.has(filename))  return true;

    // Extra ignore patterns from config / .gitignore
    const normalised = path.startsWith('/') ? path : `/${path}`;
    for (const re of this.ignorePatterns) {
      if (re.test(normalised)) return true;
    }

    return false;
  }

  /** True if the filename indicates a generated file. */
  isGenerated(path: string): boolean {
    return GENERATED_PATTERNS.some(p => p.test(path));
  }

  /** True if the extension indicates a binary/media file. */
  isBinary(ext: string): boolean {
    return HARD_EXCLUDE_EXTENSIONS.has(ext.toLowerCase());
  }

  /** Classify a file into a category. */
  classify(path: string): FileCategory {
    const segments = path.split('/');
    const filename  = segments[segments.length - 1];
    const ext       = this._ext(filename);

    if (this.shouldExclude(path)) return 'ignored';
    if (this.isBinary(ext)) return 'binary';
    if (this.isGenerated(path)) return 'generated';
    if (TEST_PATTERNS.some(p => p.test(path))) return 'test';
    if (BUILD_FILES.has(filename)) return 'build';
    if (['sql', 'migration'].includes(ext) || path.includes('/migration')) return 'migration';
    if (['graphql', 'gql', 'proto', 'thrift', 'avro', 'xsd'].includes(ext)) return 'schema';
    if (['md', 'mdx', 'rst', 'txt', 'adoc'].includes(ext)) return 'documentation';
    if (CONFIG_EXTENSIONS.has(ext)) return 'config';
    if (Object.keys(EXT_TO_LANGUAGE).includes(ext)) return 'source';
    return 'config';
  }

  /** Assign importance score. */
  importance(path: string, category: FileCategory): FileImportance {
    if (category === 'ignored' || category === 'binary' || category === 'generated') return 'ignore';
    const filename = path.split('/').pop() ?? '';
    if (IMPORTANT_ROOT_FILES.has(filename)) return 'critical';
    if (category === 'test') return 'medium';
    if (category === 'source') {
      // Entry-point heuristics
      if (/main\.(kt|java|ts|tsx|swift|py|go)$/i.test(filename)) return 'critical';
      if (/Activity\.(kt|java)$/i.test(filename)) return 'high';
      if (/ViewModel\.(kt|java)$/i.test(filename)) return 'high';
      if (/Repository\.(kt|java|ts)$/i.test(filename)) return 'high';
      if (/Service\.(kt|java|ts)$/i.test(filename)) return 'high';
      if (/Controller\.(kt|java|ts)$/i.test(filename)) return 'high';
      if (/Fragment\.(kt|java)$/i.test(filename)) return 'medium';
      if (/Screen\.(tsx|kt|dart)$/i.test(filename)) return 'medium';
      return 'medium';
    }
    return 'low';
  }

  /** Detect the language from file extension. */
  language(ext: string): ProjectLanguage {
    return EXT_TO_LANGUAGE[ext.toLowerCase()] ?? 'Unknown';
  }

  /** Build a full ProjectFileMetadata for a file path and size. */
  buildMetadata(
    path:         string,
    sizeBytes:    number,
    hash:         string,
    lastModified?: string,
  ): Omit<ProjectFileMetadata, 'isSensitive'> {
    const segments  = path.split('/');
    const filename  = segments[segments.length - 1];
    const ext       = this._ext(filename);
    const category  = this.classify(path);
    const lang      = this.language(ext);

    return {
      path,
      name:        filename,
      extension:   ext,
      language:    lang,
      sizeBytes,
      hash,
      category,
      importance:  this.importance(path, category),
      isGenerated: this.isGenerated(path),
      isBinary:    this.isBinary(ext),
      isIgnored:   this.shouldExclude(path),
      isTest:      TEST_PATTERNS.some(p => p.test(path)),
      lastModified,
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private _ext(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }

  private _compileIgnorePatterns(lines: string[]): RegExp[] {
    const patterns: RegExp[] = [];
    for (const line of lines) {
      // Strip trailing slash (directory marker), then trim
      const trimmed = line.trim().replace(/\/$/, '');
      if (!trimmed || trimmed.startsWith('#')) continue;
      try {
        // Handle ** first, then escape regex special chars, then handle * and ?
        let src = trimmed;
        // Replace ** with a placeholder before any escaping
        src = src.replace(/\*\*/g, '\x00GLOB\x00');
        // Escape all regex-special chars except * ? (handled separately)
        src = src.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        // Now substitute back
        src = src.replace(/\x00GLOB\x00/g, '.*');
        // Remaining single * → match non-slash segment
        src = src.replace(/\*/g, '[^/]*');
        // ? → single non-slash char
        src = src.replace(/\?/g, '[^/]');

        const anchored = trimmed.startsWith('/')
          ? `^${src}`                    // anchored at root
          : `(^|/)${src}`;              // anywhere in path

        // Match the segment itself OR its children
        patterns.push(new RegExp(`${anchored}(/|$)`));
      } catch {
        // Malformed pattern — skip
      }
    }
    return patterns;
  }
}
