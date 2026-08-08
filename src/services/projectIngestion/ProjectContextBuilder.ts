// ─── M10: ProjectContextBuilder — assemble AI context from ProjectKnowledge ───
// Applies token budget. Never includes raw source. Only summaries & symbols.
// Used by AI Test Generator to replace manual file paste.

import type {
  ProjectKnowledge,
  ProjectContext,
  ProjectContextQuery,
  FileSummary,
  CodeModule,
} from './types.js';

const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function formatModule(mod: CodeModule): string {
  return `Module: ${mod.name} (${mod.type}) — ${mod.fileCount} files${mod.testCount > 0 ? `, ${mod.testCount} tests` : ''}`;
}

function formatFileSummary(f: FileSummary): string {
  const syms = f.symbols.slice(0, 5).join(', ');
  return `${f.path}: ${f.purpose}${syms ? ` [${syms}]` : ''}`;
}

function scoreRelevance(
  f:      FileSummary,
  query:  ProjectContextQuery,
  mods:   CodeModule[],
): number {
  let score = 0;
  const feature = (query.feature ?? '').toLowerCase();
  const allText = [f.path, f.purpose, ...f.symbols, ...f.imports, ...f.tags].join(' ').toLowerCase();

  if (feature && allText.includes(feature)) score += 10;
  if (query.filePaths?.includes(f.path)) score += 20;
  if (query.moduleIds?.includes(f.moduleId)) score += 15;
  if (f.tags.some(t => feature && t.includes(feature))) score += 5;

  // Importance bonus
  const mod = mods.find(m => m.id === f.moduleId);
  if (mod?.type === 'core') score += 2;
  if (mod?.type === 'feature') score += 1;

  // Test coverage hints
  if (query.includeTests && f.tags.includes('test')) score += 3;

  return score;
}

export class ProjectContextBuilder {

  build(knowledge: ProjectKnowledge, query: ProjectContextQuery): ProjectContext {
    const maxTokens  = query.maxTokens ?? 32_000;
    let   remaining  = maxTokens;

    // ── Header: always included ───────────────────────────────────────────────
    const headerParts = [
      `Project: ${knowledge.name}`,
      `Type: ${knowledge.frameworks.join(', ') || knowledge.languages.join(', ')}`,
      `Architecture: ${knowledge.architectureStyle ?? 'Unknown'}`,
      `Languages: ${knowledge.languages.join(', ')}`,
      `Build: ${knowledge.buildSystem ?? 'Unknown'}`,
      `Tests: ${knowledge.testFrameworks.join(', ') || 'None detected'}`,
    ];
    const header = headerParts.join(' | ');
    remaining -= estimateTokens(header);

    // ── Modules ───────────────────────────────────────────────────────────────
    const relevantModules: CodeModule[] = [];
    if (query.moduleIds) {
      relevantModules.push(...knowledge.codeModules.filter(m => query.moduleIds!.includes(m.id)));
    } else if (query.feature) {
      const feat = query.feature.toLowerCase();
      relevantModules.push(...knowledge.codeModules.filter(m =>
        m.name.toLowerCase().includes(feat) ||
        m.description.toLowerCase().includes(feat),
      ));
    } else {
      relevantModules.push(...knowledge.codeModules.slice(0, 8));
    }

    const moduleTokens = estimateTokens(relevantModules.map(formatModule).join('\n'));
    remaining -= moduleTokens;

    // ── File summaries (scored, budget-limited) ───────────────────────────────
    const scored = knowledge.fileSummaries
      .filter(f => !f.isSensitive)
      .filter(f => query.includeTests !== false || !f.tags.includes('test'))
      .map(f => ({ f, score: scoreRelevance(f, query, knowledge.codeModules) }))
      .sort((a, b) => b.score - a.score);

    const relevantFiles: FileSummary[] = [];
    for (const { f } of scored) {
      const t = estimateTokens(formatFileSummary(f));
      if (remaining - t < 1_000) break; // keep 1K token buffer
      remaining -= t;
      relevantFiles.push(f);
    }

    // ── Dependencies (top runtime deps) ──────────────────────────────────────
    const deps = knowledge.dependencies
      .filter(d => d.kind === 'runtime')
      .slice(0, 20);

    // ── Existing tests ────────────────────────────────────────────────────────
    const existingTests = knowledge.existingTestPaths.slice(0, 20);

    const techStack = [
      ...knowledge.frameworks,
      ...knowledge.languages,
      knowledge.buildSystem,
    ].filter(Boolean).join(', ');

    return {
      projectName:     knowledge.name,
      projectSummary:  knowledge.description,
      architecture:    knowledge.architectureStyle,
      techStack,
      relevantModules,
      relevantFiles,
      dependencies:    deps,
      existingTests,
      tokenEstimate:   maxTokens - remaining,
    };
  }

  /** Serialize the context to a prompt string for AI models. */
  toPromptString(ctx: ProjectContext): string {
    const lines: string[] = [
      `# Project: ${ctx.projectName}`,
      `${ctx.projectSummary}`,
      `Tech Stack: ${ctx.techStack}`,
      ctx.architecture ? `Architecture: ${ctx.architecture}` : '',
      '',
      '## Relevant Modules',
      ...ctx.relevantModules.map(m => `- ${m.name} (${m.type}): ${m.description}`),
      '',
      '## Key Files',
      ...ctx.relevantFiles.map(f => `- ${f.path}: ${f.purpose}${f.symbols.length ? ` [${f.symbols.slice(0, 4).join(', ')}]` : ''}`),
      '',
      '## Main Dependencies',
      ...ctx.dependencies.slice(0, 15).map(d => `- ${d.name}@${d.version}`),
      '',
      ctx.existingTests.length > 0 ? '## Existing Test Files' : '',
      ...ctx.existingTests.slice(0, 10).map(p => `- ${p}`),
    ].filter(l => l !== null);

    return lines.join('\n').trim();
  }
}

export const projectContextBuilder = new ProjectContextBuilder();
