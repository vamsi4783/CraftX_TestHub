// ─── TestPlanBuilder (M12 Phase F) ───────────────────────────────────────────
// Generates an AI Test Plan — an intermediate layer between Project Intelligence
// and full test case generation. The plan describes WHAT will be tested
// (modules × coverage areas × priorities) before generating HOW (actual steps).
//
// This lets the user review and trim the plan before committing to generation.
// Pure functions — no network calls. The AI call is handled by the engine.

import type { ProjectKnowledge, CodeModule } from '../projectIngestion/types.js';
import type { AiTestPlan, TestPlanModule, TestPlanCoverageArea, TestCategory } from './types.js';

// ─── Heuristic test plan builder (no AI required) ─────────────────────────────
// Used for the "preview" before the user triggers actual AI generation.
// The AI can produce a richer plan; this gives an instant pre-view.

export function buildHeuristicTestPlan(
  knowledge:    ProjectKnowledge,
  existingCount: number,
  moduleFilter?: string[],   // undefined = all modules
): AiTestPlan {
  const targetModules = knowledge.codeModules.filter(m =>
    !moduleFilter || moduleFilter.includes(m.id),
  );

  const modules: TestPlanModule[] = targetModules.map(m =>
    buildModulePlan(m, knowledge),
  );

  const totalEstimated = modules.reduce((s, m) => s + m.estimatedNewTests, 0);

  // Identify coverage gaps
  const gaps: string[] = [];
  const uncovered = modules.filter(m => m.currentTestCount === 0);
  if (uncovered.length > 0) {
    gaps.push(`${uncovered.length} module(s) have no test coverage: ${uncovered.slice(0, 3).map(m => m.moduleName).join(', ')}${uncovered.length > 3 ? '…' : ''}`);
  }
  const weak = modules.filter(m => m.currentTestCount > 0 && m.currentTestCount < 3);
  if (weak.length > 0) {
    gaps.push(`${weak.length} module(s) have weak coverage (< 3 tests): ${weak.slice(0, 3).map(m => m.moduleName).join(', ')}${weak.length > 3 ? '…' : ''}`);
  }
  if (existingCount === 0) {
    gaps.push('No existing test cases — foundational coverage needed across all modules.');
  }

  return {
    projectName:         knowledge.name,
    generatedAt:         new Date().toISOString(),
    modules,
    totalEstimatedTests: totalEstimated,
    coverageGaps:        gaps,
  };
}

function buildModulePlan(module: CodeModule, knowledge: ProjectKnowledge): TestPlanModule {
  const isCovered  = knowledge.coveredModules.includes(module.id);
  const areas:     TestPlanCoverageArea[] = [];

  // Always include a smoke check
  areas.push(coverageArea('Basic smoke check — module loads and core elements render', 'smoke', 'high', true));

  // Module-type-specific areas
  switch (module.type) {
    case 'feature':
      areas.push(coverageArea('Happy path user flow — primary workflow completes successfully', 'happy_path', 'high', true));
      areas.push(coverageArea('Form validation — required fields, format errors', 'validation', 'medium', true));
      areas.push(coverageArea('Navigation — back/forward, deep links, transitions', 'navigation', 'medium', true));
      if (!isCovered) {
        areas.push(coverageArea('Negative input handling — invalid data, empty fields', 'negative', 'medium', false));
      }
      break;

    case 'core':
      areas.push(coverageArea('Core business logic — primary operation succeeds with valid input', 'happy_path', 'high', true));
      areas.push(coverageArea('Data validation — malformed input rejected gracefully', 'data_validation', 'high', true));
      areas.push(coverageArea('Integration with dependent modules', 'integration', 'medium', false));
      if (!isCovered) {
        areas.push(coverageArea('Boundary conditions — zero, maximum, edge values', 'boundary', 'medium', false));
      }
      break;

    case 'shared':
    case 'infrastructure':
      areas.push(coverageArea('Shared utility — expected output for standard inputs', 'happy_path', 'medium', true));
      areas.push(coverageArea('Edge cases — null, empty, extreme values', 'boundary', 'medium', false));
      break;

    case 'config':
      areas.push(coverageArea('Configuration loading — correct values applied at startup', 'smoke', 'high', true));
      areas.push(coverageArea('Invalid configuration — graceful error handling', 'negative', 'medium', false));
      break;

    default:
      areas.push(coverageArea('Happy path — primary functionality works correctly', 'happy_path', 'high', false));
      if (!isCovered) {
        areas.push(coverageArea('Negative case — invalid inputs handled gracefully', 'negative', 'medium', false));
      }
  }

  // If module has no coverage: add regression placeholder
  if (!isCovered && module.fileCount > 3) {
    areas.push(coverageArea('Regression baseline — critical path does not break after changes', 'regression', 'high', false));
  }

  return {
    moduleId:          module.id,
    moduleName:        module.name,
    coverageAreas:     areas,
    currentTestCount:  module.testCount,   // actual project-source test count from CodeModule
    estimatedNewTests: areas.length,
  };
}

function coverageArea(
  name:      string,
  category:  TestCategory,
  priority:  TestPlanCoverageArea['priority'],
  detected:  boolean,
): TestPlanCoverageArea {
  return {
    name,
    category,
    priority,
    detected,
    rationale: detected
      ? 'Identified from project structure and file analysis.'
      : 'Inferred from module type and common testing patterns.',
  };
}

// ─── AI prompt for rich test plan ─────────────────────────────────────────────

export function buildTestPlanPrompt(
  knowledge:    ProjectKnowledge,
  moduleFilter?: string[],
): string {
  const targetModules = knowledge.codeModules.filter(m =>
    !moduleFilter || moduleFilter.includes(m.id),
  );

  const moduleList = targetModules.slice(0, 20).map(m => {
    const covered = knowledge.coveredModules.includes(m.id);
    return `  - ${m.name} (${m.type}, ${m.fileCount} files)${covered ? ' [has tests]' : ' [NO TESTS]'}`;
  }).join('\n');

  return `You are an expert QA engineer creating a structured test plan for a software project.

PROJECT:
  Name:         ${knowledge.name}
  Tech:         ${[...knowledge.frameworks, ...knowledge.languages].join(', ')}
  Architecture: ${knowledge.architectureStyle ?? 'Unknown'}
  Purpose:      ${knowledge.description}

MODULES TO PLAN (${targetModules.length} total):
${moduleList}

EXISTING COVERAGE:
  ${knowledge.coveredModules.length} of ${knowledge.codeModules.length} modules have some test coverage.

For each module, identify 2–5 specific test coverage areas.
For each area, specify:
  - A specific, actionable test scenario (not generic)
  - The test category: smoke|happy_path|validation|boundary|negative|permission|navigation|regression|integration|performance|api|data_validation|compatibility
  - Priority: high|medium|low
  - Whether it was detected (true) or inferred (false)
  - A brief rationale

Return ONLY valid JSON:
{
  "modules": [
    {
      "moduleId": "string",
      "moduleName": "string",
      "coverageAreas": [
        {
          "name": "string (specific scenario)",
          "category": "string",
          "priority": "high|medium|low",
          "detected": boolean,
          "rationale": "string"
        }
      ],
      "estimatedNewTests": number
    }
  ],
  "coverageGaps": ["string"]
}`;
}
