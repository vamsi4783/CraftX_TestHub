// ─── Coverage Analysis Service (M12 Phase G) ─────────────────────────────────
// Computes a "TestHub AI Coverage Estimate" by mapping existing test_cases
// against project modules detected by Project Intelligence.
//
// IMPORTANT: This is NOT code coverage. It is a logical estimate based on:
//  - Modules detected by ProjectStructureAnalyzer
//  - Test case titles and tags cross-referenced to module names
//  - Explicitly labelled as an estimate in all user-facing surfaces

import type { ProjectKnowledge, CodeModule } from './projectIngestion/types.js';
import type { TestCase } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModuleCoverageEntry {
  module:        CodeModule;
  testCount:     number;       // TestHub test cases mapped to this module
  coverageLevel: 'none' | 'weak' | 'moderate' | 'strong';
  matchedTitles: string[];     // test titles that matched this module
}

export interface CoverageAnalysisResult {
  projectName:      string;
  totalModules:     number;
  coveredModules:   number;
  uncoveredModules: number;
  weakModules:      number;
  estimatedPercent: number;    // 0–100 rounded
  entries:          ModuleCoverageEntry[];
  disclaimer:       string;
}

// ─── Main analysis ────────────────────────────────────────────────────────────

/**
 * Produce a module-level TestHub coverage estimate.
 *
 * Matching strategy (heuristic):
 *  1. Exact module name contained in test case title (case-insensitive)
 *  2. Module name keyword overlap ≥ 50% of module name tokens in the title
 *  3. Test case tags contain any module name token
 */
export function analyzeCoverage(
  knowledge:   ProjectKnowledge,
  testCases:   TestCase[],
): CoverageAnalysisResult {
  const entries: ModuleCoverageEntry[] = knowledge.codeModules.map(module => {
    const moduleTokens = tokenize(module.name);
    const matched: string[] = [];

    for (const tc of testCases) {
      if (matchesModule(tc, module.name, moduleTokens)) {
        matched.push(tc.title);
      }
    }

    const testCount = matched.length;
    const coverageLevel =
      testCount === 0  ? 'none'     :
      testCount <= 2   ? 'weak'     :
      testCount <= 5   ? 'moderate' :
                         'strong';

    return { module, testCount, coverageLevel, matchedTitles: matched };
  });

  const covered  = entries.filter(e => e.testCount > 0).length;
  const weak     = entries.filter(e => e.coverageLevel === 'weak').length;
  const total    = entries.length;

  // Score: each covered module contributes proportional to coverage level
  const score = entries.reduce((sum, e) => {
    const weight =
      e.coverageLevel === 'none'     ? 0   :
      e.coverageLevel === 'weak'     ? 0.3 :
      e.coverageLevel === 'moderate' ? 0.7 :
                                       1.0;
    return sum + weight;
  }, 0);

  const estimatedPercent = total === 0 ? 0 : Math.round((score / total) * 100);

  return {
    projectName:      knowledge.name,
    totalModules:     total,
    coveredModules:   covered,
    uncoveredModules: total - covered,
    weakModules:      weak,
    estimatedPercent,
    entries,
    disclaimer: 'TestHub AI Coverage Estimate — logical estimate based on module names and test case titles. Not actual code coverage.',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function matchesModule(tc: TestCase, moduleName: string, moduleTokens: string[]): boolean {
  const title = tc.title.toLowerCase();
  const tags  = (tc.tags ?? []).map(t => t.toLowerCase());

  // Exact module name in title
  if (title.includes(moduleName.toLowerCase())) return true;

  // Keyword overlap: if ≥50% of module tokens appear in title
  if (moduleTokens.length > 0) {
    const matchCount = moduleTokens.filter(t => title.includes(t)).length;
    if (matchCount / moduleTokens.length >= 0.5) return true;
  }

  // Module name token in tags
  if (moduleTokens.some(t => tags.some(tag => tag.includes(t)))) return true;

  return false;
}
