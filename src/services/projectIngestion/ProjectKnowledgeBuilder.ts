// ─── M10: ProjectKnowledgeBuilder — assemble ProjectKnowledge from index ──────
// Runs AFTER the file index is built. Uses static analysis for structural
// knowledge; optionally uses the user's configured AI connector for summaries.
// Raw source content is NEVER stored — only purpose/symbols/imports.

import type {
  ProjectKnowledge,
  FileSummary,
  ProjectFileMetadata,
  CodeModule,
  ProjectDependency,
  EntryPoint,
} from './types.js';
import type { SourceFileContent } from './IProjectSourceProvider.js';
import type { ProjectStructure } from './ProjectStructureAnalyzer.js';
import { secretScanner } from './SecretScanner.js';

// ─── Static symbol extraction ─────────────────────────────────────────────────

function extractSymbols(content: string, ext: string): string[] {
  const symbols: string[] = [];
  const patterns: RegExp[] = [];

  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    patterns.push(
      /export\s+(?:default\s+)?(?:class|function|const|interface|type|enum)\s+([A-Z][A-Za-z0-9_]*)/g,
      /export\s+\{([^}]+)\}/g,
    );
  } else if (['kt', 'kts'].includes(ext)) {
    patterns.push(
      /(?:class|object|interface|fun|val|var)\s+([A-Z][A-Za-z0-9_]*)/g,
      /@Composable\s*\nfun\s+([A-Z][A-Za-z0-9_]*)/g,
    );
  } else if (ext === 'java') {
    patterns.push(/(?:public\s+)?(?:class|interface|enum)\s+([A-Z][A-Za-z0-9_]*)/g);
  } else if (ext === 'swift') {
    patterns.push(/(?:class|struct|protocol|enum|extension)\s+([A-Z][A-Za-z0-9_]*)/g);
  } else if (ext === 'py') {
    patterns.push(/^(?:class|def)\s+([A-Za-z_][A-Za-z0-9_]*)/gm);
  } else if (ext === 'cs') {
    patterns.push(/(?:public\s+)?(?:class|interface|struct|enum)\s+([A-Z][A-Za-z0-9_]*)/g);
  }

  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const sym = m[1].trim();
      if (sym && !symbols.includes(sym)) symbols.push(sym);
      if (symbols.length >= 30) break;
    }
  }

  return symbols;
}

function extractImports(content: string, ext: string): string[] {
  const imports: string[] = [];
  const patterns: RegExp[] = [];

  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
    patterns.push(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
    patterns.push(/require\(['"]([^'"]+)['"]\)/g);
  } else if (['kt', 'kts'].includes(ext)) {
    patterns.push(/^import\s+([\w.]+)/gm);
  } else if (ext === 'java') {
    patterns.push(/^import\s+([\w.]+)/gm);
  } else if (ext === 'swift') {
    patterns.push(/^import\s+(\w+)/gm);
  } else if (ext === 'py') {
    patterns.push(/^(?:import|from)\s+([\w.]+)/gm);
  } else if (ext === 'dart') {
    patterns.push(/^import\s+'([^']+)'/gm);
  }

  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const mod = m[1].split('/')[0];
      if (mod && !imports.includes(mod)) imports.push(mod);
      if (imports.length >= 20) break;
    }
  }

  return imports;
}

function inferPurpose(path: string, symbols: string[], ext: string): string {
  const name = path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
  if (symbols.length === 0) return `${name} file`;

  if (/ViewModel/i.test(name)) return `ViewModel exposing: ${symbols.slice(0, 3).join(', ')}`;
  if (/Repository/i.test(name)) return `Repository: ${symbols.slice(0, 2).join(', ')}`;
  if (/Service/i.test(name)) return `Service: ${symbols.slice(0, 2).join(', ')}`;
  if (/Controller/i.test(name)) return `Controller: ${symbols.slice(0, 2).join(', ')}`;
  if (/Activity/i.test(name)) return `Activity screen: ${name}`;
  if (/Fragment/i.test(name)) return `Fragment: ${name}`;
  if (/Screen|Page/i.test(name)) return `UI screen: ${name}`;
  if (/Component/i.test(name)) return `UI component: ${symbols.slice(0, 2).join(', ')}`;
  if (/Util|Utils|Helper/i.test(name)) return `Utilities: ${symbols.slice(0, 3).join(', ')}`;
  if (/Test|Spec/i.test(name)) return `Tests for: ${name.replace(/Test|Spec/i, '')}`;
  return `${name}: ${symbols.slice(0, 2).join(', ')}`;
}

function inferTags(path: string, symbols: string[]): string[] {
  const tags: string[] = [];
  const lower = path.toLowerCase();
  const all   = [lower, ...symbols.map(s => s.toLowerCase())].join(' ');

  if (/screen|activity|fragment|page|view/i.test(all)) tags.push('screen');
  if (/viewmodel|state|uistate/i.test(all)) tags.push('viewmodel');
  if (/repository|datasource/i.test(all)) tags.push('repository');
  if (/service|api|client/i.test(all)) tags.push('service');
  if (/usecase|interactor/i.test(all)) tags.push('usecase');
  if (/di|inject|module|provide/i.test(all)) tags.push('di');
  if (/test|spec/i.test(lower)) tags.push('test');
  if (/model|entity|data/i.test(all)) tags.push('model');
  if (/composable|compose/i.test(all)) tags.push('compose');
  if (/navigation|route|nav/i.test(all)) tags.push('navigation');
  if (/database|dao|room|sqlit/i.test(all)) tags.push('database');
  if (/network|retrofit|api|http/i.test(all)) tags.push('network');
  if (/payment|billing|purchase/i.test(all)) tags.push('payment');
  if (/auth|login|logout|signup/i.test(all)) tags.push('auth');
  if (/notification|push|fcm/i.test(all)) tags.push('notification');

  return tags;
}

// ─── ProjectKnowledgeBuilder ──────────────────────────────────────────────────

export class ProjectKnowledgeBuilder {

  buildKnowledge(
    projectId:  string,
    sourceId:   string,
    projectName: string,
    files:      ProjectFileMetadata[],
    contents:   SourceFileContent[],
    structure:  ProjectStructure,
  ): ProjectKnowledge {
    const contentMap = new Map(contents.map(c => [c.path, c]));

    const fileSummaries = this._buildFileSummaries(files, contentMap, structure);

    const coveredModules   = this._computeCoveredModules(files, structure.codeModules);
    const uncoveredModules = structure.codeModules
      .filter(m => !coveredModules.includes(m.id))
      .map(m => m.id);

    const coverageScore = structure.codeModules.length > 0
      ? coveredModules.length / structure.codeModules.length
      : 0;

    const total     = files.length;
    const ignored   = files.filter(f => f.isIgnored).length;
    const sensitive = files.filter(f => f.isSensitive).length;
    const indexed   = total - ignored;

    return {
      projectId,
      sourceId,
      generatedAt:       new Date().toISOString(),
      schemaVersion:     1,
      name:              projectName,
      description:       this._describeProject(structure, fileSummaries),
      purpose:           this._inferPurpose(structure, fileSummaries),
      languages:         structure.languages,
      frameworks:        structure.frameworks,
      buildSystem:       structure.buildSystem,
      testFrameworks:    structure.testFrameworks,
      architectureStyle: structure.architectureStyle,
      codeModules:       structure.codeModules,
      entryPoints:       structure.entryPoints,
      dependencies:      structure.dependencies,
      configFiles:       structure.configFiles,
      existingTestPaths: structure.existingTestPaths,
      coveredModules,
      uncoveredModules,
      coverageScore,
      fileSummaries,
      totalFiles:     total,
      indexedFiles:   indexed,
      ignoredFiles:   ignored,
      sensitiveFiles: sensitive,
      languageStats:  structure.languageStats,
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private _buildFileSummaries(
    files:      ProjectFileMetadata[],
    contentMap: Map<string, SourceFileContent>,
    structure:  ProjectStructure,
  ): FileSummary[] {
    const summaries: FileSummary[] = [];

    const moduleForFile = new Map<string, string>();
    for (const mod of structure.codeModules) {
      for (const p of mod.filePaths) {
        moduleForFile.set(p, mod.id);
      }
    }

    for (const file of files) {
      if (file.isIgnored || file.isBinary || file.category === 'binary') continue;
      if (file.isSensitive) continue;

      const content = contentMap.get(file.path);
      const ext     = file.extension;
      const raw     = content?.content ?? '';

      // Skip if content was flagged sensitive (double-check)
      if (raw && secretScanner.shouldExcludeFromAI(file.path, raw)) continue;

      const symbols     = extractSymbols(raw, ext);
      const imports     = extractImports(raw, ext);
      const purpose     = inferPurpose(file.path, symbols, ext);
      const tags        = inferTags(file.path, symbols);
      const testTargets = file.isTest
        ? symbols.filter(s => /Test|Spec/i.test(s))
        : [];

      summaries.push({
        path:        file.path,
        hash:        file.hash,
        purpose,
        symbols,
        imports,
        testTargets,
        moduleId:    moduleForFile.get(file.path) ?? '',
        tags,
        isSensitive: false,
      });
    }

    return summaries;
  }

  private _computeCoveredModules(
    files:   ProjectFileMetadata[],
    modules: CodeModule[],
  ): string[] {
    const coveredIds: string[] = [];
    for (const mod of modules) {
      // A module is covered if it has explicit test files, OR if any test file
      // lives in the same directory tree as the module
      if (mod.testCount > 0) {
        coveredIds.push(mod.id);
        continue;
      }
      const hasNearbyTest = files.some(f => f.isTest && f.path.startsWith(mod.path + '/'));
      if (hasNearbyTest) coveredIds.push(mod.id);
    }
    return coveredIds;
  }

  private _describeProject(
    structure: ProjectStructure,
    summaries: FileSummary[],
  ): string {
    const lang    = structure.primaryLanguage;
    const fw      = structure.frameworks.slice(0, 2).join('/') || structure.projectType;
    const modules = structure.codeModules.length;
    const arch    = structure.architectureStyle ? ` (${structure.architectureStyle})` : '';
    return `${fw} ${lang} project with ${modules} module${modules !== 1 ? 's' : ''}${arch}. ${summaries.length} indexed files.`;
  }

  private _inferPurpose(
    structure: ProjectStructure,
    summaries: FileSummary[],
  ): string {
    // Attempt to find the main entry-point summary
    for (const ep of structure.entryPoints) {
      const s = summaries.find(f => f.path === ep.path);
      if (s) return s.purpose;
    }
    return `A ${structure.projectType} application.`;
  }
}

export const projectKnowledgeBuilder = new ProjectKnowledgeBuilder();
