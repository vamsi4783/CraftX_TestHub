// ─── M10: ProjectStructureAnalyzer — static analysis without AI ───────────────
// Derives modules, entry points, dependencies, and basic project identity
// from file paths + manifest file contents.
// Pure functions — no network calls, no AI.

import type {
  ProjectFileMetadata,
  CodeModule,
  EntryPoint,
  ProjectDependency,
  ProjectLanguage,
} from './types.js';
import type { SourceFileContent } from './IProjectSourceProvider.js';

const uuidv4 = () => crypto.randomUUID();

// ─── Framework detection ──────────────────────────────────────────────────────

interface FrameworkSignal {
  framework: string;
  patterns:  RegExp[];
}

const FRAMEWORK_SIGNALS: FrameworkSignal[] = [
  { framework: 'React',              patterns: [/react/i, /\.tsx$/] },
  { framework: 'Next.js',            patterns: [/next\.config/i, /next\/navigation/i] },
  { framework: 'Vue',                patterns: [/vue\.config/i, /\.vue$/] },
  { framework: 'Angular',            patterns: [/angular\.json/i, /@angular\//i] },
  { framework: 'Svelte',             patterns: [/svelte\.config/i, /\.svelte$/] },
  { framework: 'Jetpack Compose',    patterns: [/Composable/i, /@Composable/] },
  { framework: 'Android Views',      patterns: [/AppCompatActivity/i, /setContentView/i] },
  { framework: 'SwiftUI',            patterns: [/SwiftUI/i, /View {/i] },
  { framework: 'UIKit',              patterns: [/UIKit/i, /UIViewController/i] },
  { framework: 'Flutter',            patterns: [/flutter\/material/i, /StatefulWidget/i] },
  { framework: 'Express',            patterns: [/express\(\)/i, /app\.use\(/] },
  { framework: 'Fastify',            patterns: [/fastify\(/i] },
  { framework: 'NestJS',             patterns: [/@Module\(/i, /@Controller\(/i] },
  { framework: 'Spring Boot',        patterns: [/@SpringBootApplication/i, /@RestController/i] },
  { framework: 'Django',             patterns: [/django\.db\.models/i, /urlpatterns/i] },
  { framework: 'FastAPI',            patterns: [/from fastapi/i, /@app\.get\(/i] },
  { framework: 'ASP.NET',            patterns: [/Microsoft\.AspNetCore/i, /WebApplication\.Create/i] },
  { framework: 'Hilt',               patterns: [/@HiltAndroidApp/i, /@Inject/i] },
  { framework: 'Retrofit',           patterns: [/@GET\(|@POST\(|@PUT\(|@DELETE\(/i] },
  { framework: 'Room',               patterns: [/@Database\(/i, /@Entity/i] },
];

const ARCHITECTURE_PATTERNS: Record<string, RegExp[]> = {
  'MVVM': [/ViewModel/i, /LiveData|StateFlow|MutableState/i],
  'MVC':  [/Controller/i, /View/i],
  'MVP':  [/Presenter/i, /Contract/i],
  'Clean Architecture': [/UseCase|Interactor/i, /Repository/i, /Entity/i],
  'Redux': [/createSlice|createReducer/i, /dispatch\(/i],
  'BLoC': [/Bloc\(/i, /BlocProvider/i],
};

// ─── Module grouping heuristics ───────────────────────────────────────────────

const COMMON_MODULE_DIRS = [
  'auth', 'authentication', 'login',
  'payment', 'billing', 'checkout',
  'home', 'dashboard', 'main',
  'profile', 'user', 'account', 'settings',
  'product', 'catalog', 'inventory',
  'order', 'cart', 'search',
  'notification', 'push',
  'network', 'api', 'data', 'repository',
  'database', 'db', 'storage',
  'util', 'utils', 'common', 'shared', 'core',
  'test', 'tests',
  'di', 'injection',
  'navigation', 'routing',
  'ui', 'components', 'views', 'screens', 'pages', 'features',
];

// ─── ProjectStructureAnalyzer ─────────────────────────────────────────────────

export interface ProjectStructure {
  projectType:       string;
  languages:         ProjectLanguage[];
  primaryLanguage:   ProjectLanguage;
  frameworks:        string[];
  architectureStyle: string | null;
  buildSystem:       string | null;
  testFrameworks:    string[];
  codeModules:       CodeModule[];
  entryPoints:       EntryPoint[];
  dependencies:      ProjectDependency[];
  configFiles:       string[];
  existingTestPaths: string[];
  languageStats:     Record<string, number>;
}

export class ProjectStructureAnalyzer {

  analyze(
    files: ProjectFileMetadata[],
    manifestContents: SourceFileContent[],
  ): ProjectStructure {
    const manifestMap = new Map(manifestContents.map(f => [f.path, f.content]));

    const languages     = this._detectLanguages(files);
    const primaryLang   = languages[0] ?? 'Unknown';
    const frameworks    = this._detectFrameworks(files, manifestContents);
    const buildSystem   = this._detectBuildSystem(files);
    const testFw        = this._detectTestFrameworks(files, manifestContents);
    const architecture  = this._detectArchitecture(files, manifestContents);
    const dependencies  = this._extractDependencies(manifestContents);
    const configFiles   = files.filter(f => f.category === 'config').map(f => f.path);
    const testPaths     = files.filter(f => f.isTest).map(f => f.path);
    const codeModules   = this._groupIntoModules(files);
    const entryPoints   = this._detectEntryPoints(files, manifestMap);
    const languageStats = this._languageStats(files);

    const projectType = this._inferProjectType(primaryLang, frameworks, files);

    return {
      projectType,
      languages,
      primaryLanguage: primaryLang,
      frameworks,
      architectureStyle: architecture,
      buildSystem,
      testFrameworks: testFw,
      codeModules,
      entryPoints,
      dependencies,
      configFiles,
      existingTestPaths: testPaths,
      languageStats,
    };
  }

  // ─── Language detection ────────────────────────────────────────────────────

  private _detectLanguages(files: ProjectFileMetadata[]): ProjectLanguage[] {
    const counts = new Map<ProjectLanguage, number>();
    for (const f of files) {
      if (f.language !== 'Unknown' && f.category === 'source') {
        counts.set(f.language, (counts.get(f.language) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang);
  }

  private _languageStats(files: ProjectFileMetadata[]): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const f of files) {
      if (!f.isIgnored && !f.isBinary) {
        const lang = f.language !== 'Unknown' ? f.language : f.extension || 'other';
        stats[lang] = (stats[lang] ?? 0) + 1;
      }
    }
    return stats;
  }

  // ─── Framework detection ───────────────────────────────────────────────────

  private _detectFrameworks(
    files:    ProjectFileMetadata[],
    manifests: SourceFileContent[],
  ): string[] {
    // Test each piece of evidence individually to avoid multi-line $ anchor issues
    const evidences: string[] = [
      ...files.map(f => f.path),
      ...manifests.map(m => m.content),
    ];

    return FRAMEWORK_SIGNALS
      .filter(sig => sig.patterns.every(p => {
        // Create a fresh regex (no g flag to avoid lastIndex issues)
        const re = new RegExp(p.source, p.flags.replace('g', '') + 'm');
        return evidences.some(e => re.test(e));
      }))
      .map(sig => sig.framework);
  }

  // ─── Build system detection ────────────────────────────────────────────────

  private _detectBuildSystem(files: ProjectFileMetadata[]): string | null {
    const filenames = new Set(files.map(f => f.name.toLowerCase()));
    if (filenames.has('build.gradle') || filenames.has('build.gradle.kts')) return 'Gradle';
    if (filenames.has('pom.xml')) return 'Maven';
    if (filenames.has('package.json')) return 'npm/Node';
    if (filenames.has('pubspec.yaml')) return 'Flutter/Dart pub';
    if (filenames.has('cmakelists.txt')) return 'CMake';
    if (filenames.has('makefile') || filenames.has('Makefile')) return 'Make';
    if (filenames.has('cargo.toml')) return 'Cargo';
    if (filenames.has('setup.py') || filenames.has('pyproject.toml')) return 'Python setuptools';
    if (filenames.has('package.swift')) return 'Swift Package Manager';
    return null;
  }

  // ─── Test framework detection ──────────────────────────────────────────────

  private _detectTestFrameworks(
    files:    ProjectFileMetadata[],
    manifests: SourceFileContent[],
  ): string[] {
    const allText = [
      ...files.map(f => f.path),
      ...manifests.map(m => m.content),
    ].join('\n');

    const frameworks: string[] = [];
    if (/junit/i.test(allText))           frameworks.push('JUnit');
    if (/espresso/i.test(allText))        frameworks.push('Espresso');
    if (/mockito|mockk/i.test(allText))   frameworks.push('Mockito/MockK');
    if (/xctest/i.test(allText))          frameworks.push('XCTest');
    if (/vitest/i.test(allText))          frameworks.push('Vitest');
    if (/jest/i.test(allText))            frameworks.push('Jest');
    if (/pytest/i.test(allText))          frameworks.push('pytest');
    if (/rspec/i.test(allText))           frameworks.push('RSpec');
    if (/flutter_test/i.test(allText))    frameworks.push('Flutter Test');
    if (/nunit|xunit|mstest/i.test(allText)) frameworks.push('.NET Test');
    return frameworks;
  }

  // ─── Architecture detection ────────────────────────────────────────────────

  private _detectArchitecture(
    files:    ProjectFileMetadata[],
    manifests: SourceFileContent[],
  ): string | null {
    const allPaths = files.map(f => f.path).join('\n');
    const allText  = [allPaths, ...manifests.map(m => m.content)].join('\n');

    for (const [name, patterns] of Object.entries(ARCHITECTURE_PATTERNS)) {
      if (patterns.some(p => p.test(allText))) return name;
    }
    return null;
  }

  // ─── Module grouping ───────────────────────────────────────────────────────

  private _groupIntoModules(files: ProjectFileMetadata[]): CodeModule[] {
    const sourceFiles = files.filter(f => !f.isIgnored && !f.isBinary);

    // Group by top-level meaningful directory
    const dirGroups = new Map<string, ProjectFileMetadata[]>();
    for (const f of sourceFiles) {
      const dir = this._moduleDir(f.path);
      if (!dirGroups.has(dir)) dirGroups.set(dir, []);
      dirGroups.get(dir)!.push(f);
    }

    const modules: CodeModule[] = [];
    for (const [dir, groupFiles] of dirGroups) {
      if (groupFiles.length === 0) continue;
      const moduleType = this._inferModuleType(dir, groupFiles);
      const testCount  = groupFiles.filter(f => f.isTest).length;
      modules.push({
        id:          uuidv4(),
        name:        dir.split('/').pop() || dir || 'root',
        path:        dir,
        filePaths:   groupFiles.map(f => f.path),
        description: this._describeModule(dir, groupFiles),
        type:        moduleType,
        dependsOn:   [],
        fileCount:   groupFiles.length,
        testCount,
      });
    }

    return modules.sort((a, b) => b.fileCount - a.fileCount);
  }

  private _moduleDir(path: string): string {
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 1) return '';
    // Find the first meaningful directory segment
    for (let i = 0; i < Math.min(parts.length - 1, 4); i++) {
      const seg = parts[i].toLowerCase();
      if (COMMON_MODULE_DIRS.includes(seg)) return parts.slice(0, i + 1).join('/');
      if (seg === 'src' || seg === 'lib' || seg === 'app') continue;
      if (seg === 'main' || seg === 'androidmain') continue;
      return parts.slice(0, i + 1).join('/');
    }
    return parts[0];
  }

  private _inferModuleType(
    dir:   string,
    files: ProjectFileMetadata[],
  ): CodeModule['type'] {
    const name = dir.toLowerCase();
    if (files.every(f => f.isTest)) return 'test';
    if (/build|gradle|cmake|makefile/i.test(name)) return 'build';
    if (/config|settings/i.test(name)) return 'config';
    if (/util|utils|helper|helpers|common|lib/i.test(name)) return 'shared';
    if (/core|base|foundation/i.test(name)) return 'core';
    if (/di|injection|hilt|dagger/i.test(name)) return 'infrastructure';
    return 'feature';
  }

  private _describeModule(dir: string, files: ProjectFileMetadata[]): string {
    const name = dir.split('/').pop() ?? dir;
    const srcCount  = files.filter(f => f.category === 'source').length;
    const testCount = files.filter(f => f.isTest).length;
    return `${name} module — ${srcCount} source file${srcCount !== 1 ? 's' : ''}${testCount > 0 ? `, ${testCount} test${testCount !== 1 ? 's' : ''}` : ''}`;
  }

  // ─── Entry point detection ─────────────────────────────────────────────────

  private _detectEntryPoints(
    files:    ProjectFileMetadata[],
    manifests: Map<string, string>,
  ): EntryPoint[] {
    const entries: EntryPoint[] = [];

    for (const f of files) {
      const name = f.name;
      if (/^main\.(kt|java|ts|tsx|swift|py|go|dart)$/i.test(name)) {
        entries.push({ path: f.path, kind: 'main', name: f.name });
      } else if (/Activity\.(kt|java)$/.test(name)) {
        entries.push({ path: f.path, kind: 'activity', name: name.replace(/\.(kt|java)$/, '') });
      } else if (/ViewController\.(swift)$/.test(name)) {
        entries.push({ path: f.path, kind: 'screen', name: name.replace(/\.swift$/, '') });
      } else if (/App\.(tsx|ts|jsx|js)$/.test(name)) {
        entries.push({ path: f.path, kind: 'route', name: 'App Entry' });
      } else if (/routes?\.(tsx|ts|jsx|js)$/i.test(name)) {
        entries.push({ path: f.path, kind: 'route', name: 'Routes' });
      } else if (/server\.(ts|js)$/.test(name) || /index\.(ts|js)$/.test(name)) {
        if (f.importance === 'critical') {
          entries.push({ path: f.path, kind: 'api_handler', name: name });
        }
      }
    }

    // From AndroidManifest.xml: extract launcher activity
    const manifest = manifests.get('AndroidManifest.xml') ?? manifests.get('app/src/main/AndroidManifest.xml');
    if (manifest) {
      const launcherMatch = /android:name="([^"]+)"[\s\S]*?LAUNCHER/g.exec(manifest);
      if (launcherMatch) {
        entries.push({
          path:        'AndroidManifest.xml',
          kind:        'activity',
          name:        launcherMatch[1].split('.').pop() ?? 'LauncherActivity',
          description: 'LAUNCHER activity from AndroidManifest.xml',
        });
      }
    }

    return entries.slice(0, 30);
  }

  // ─── Dependency extraction ─────────────────────────────────────────────────

  private _extractDependencies(manifests: SourceFileContent[]): ProjectDependency[] {
    const deps: ProjectDependency[] = [];

    for (const m of manifests) {
      const filename = m.path.split('/').pop() ?? '';
      if (filename === 'package.json') {
        deps.push(...this._parsePackageJson(m.content));
      } else if (filename.endsWith('.gradle') || filename.endsWith('.gradle.kts')) {
        deps.push(...this._parseGradle(m.content));
      } else if (filename === 'pubspec.yaml') {
        deps.push(...this._parsePubspec(m.content));
      } else if (filename === 'requirements.txt') {
        deps.push(...this._parseRequirements(m.content));
      }
    }

    // Deduplicate by name
    const seen = new Set<string>();
    return deps.filter(d => {
      if (seen.has(d.name)) return false;
      seen.add(d.name);
      return true;
    });
  }

  private _parsePackageJson(content: string): ProjectDependency[] {
    const deps: ProjectDependency[] = [];
    try {
      const pkg = JSON.parse(content);
      const add = (map: Record<string, string> | undefined, kind: ProjectDependency['kind']) => {
        for (const [name, version] of Object.entries(map ?? {})) {
          deps.push({ name, version: String(version), kind, source: 'npm' });
        }
      };
      add(pkg.dependencies,         'runtime');
      add(pkg.devDependencies,      'dev');
      add(pkg.peerDependencies,     'peer');
    } catch { /* malformed JSON */ }
    return deps;
  }

  private _parseGradle(content: string): ProjectDependency[] {
    const deps: ProjectDependency[] = [];
    // Handles: implementation("group:name:version") and implementation 'group:name:version'
    const pattern = /(?:implementation|api|testImplementation|androidTestImplementation|debugImplementation|classpath)\s*\(?\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      const coord = m[1].trim();
      const parts = coord.split(':');
      if (parts.length >= 2) {
        const name    = parts.slice(0, 2).join(':');
        const version = parts[2] ?? 'unknown';
        const config  = m[0].split(/\s/)[0];
        const kind: ProjectDependency['kind'] =
          config.includes('test') || config.includes('Test') ? 'test' : 'runtime';
        deps.push({ name, version, kind, source: 'gradle' });
      }
    }
    return deps;
  }

  private _parsePubspec(content: string): ProjectDependency[] {
    const deps: ProjectDependency[] = [];
    const pattern = /^\s{2}([a-z_]+):\s*\^?([\d.]+)/gm;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      deps.push({ name: m[1], version: m[2], kind: 'runtime', source: 'pubspec' });
    }
    return deps;
  }

  private _parseRequirements(content: string): ProjectDependency[] {
    return content.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => {
        const [name, version = 'any'] = l.split(/[=<>!~]/);
        return { name: name.trim(), version, kind: 'runtime' as const, source: 'pypi' as const };
      });
  }

  // ─── Project type inference ────────────────────────────────────────────────

  private _inferProjectType(
    primaryLang: ProjectLanguage,
    frameworks:  string[],
    files:       ProjectFileMetadata[],
  ): string {
    if (frameworks.includes('Jetpack Compose') || frameworks.includes('Android Views')) return 'Android';
    if (frameworks.includes('SwiftUI') || frameworks.includes('UIKit')) return 'iOS';
    if (frameworks.includes('Flutter')) return 'Flutter';
    if (frameworks.includes('React') || frameworks.includes('Next.js')) return 'React/Web';
    if (frameworks.includes('Vue')) return 'Vue/Web';
    if (frameworks.includes('Angular')) return 'Angular/Web';
    if (frameworks.includes('Express') || frameworks.includes('NestJS')) return 'Node.js API';
    if (frameworks.includes('Spring Boot')) return 'Spring Boot';
    if (frameworks.includes('Django') || frameworks.includes('FastAPI')) return 'Python Web';
    if (primaryLang === 'Kotlin' || primaryLang === 'Java') return 'JVM';
    if (primaryLang === 'TypeScript' || primaryLang === 'JavaScript') return 'JavaScript/TypeScript';
    if (primaryLang === 'Python') return 'Python';
    if (primaryLang === 'CSharp') return 'C#/.NET';
    if (primaryLang === 'Swift') return 'Swift';
    if (primaryLang === 'Dart') return 'Dart';
    return 'Generic';
  }
}

export const projectStructureAnalyzer = new ProjectStructureAnalyzer();
