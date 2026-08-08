// ─── AI Test Generation Engine — Public API (Phase 4 M6) ─────────────────────
export { AITestGenerationEngine, aiTestGenerationEngine } from './AITestGenerationEngine.js';
export type { SourceFile }                                from './ProjectAnalyzer.js';
export { ProjectAnalyzer }                                from './ProjectAnalyzer.js';
export { ScreenAnalyzer }                                 from './ScreenAnalyzer.js';
export { FlowAnalyzer }                                   from './FlowAnalyzer.js';
export { TestCaseGenerator }                              from './TestCaseGenerator.js';
export { SuggestionEngine, jaccardSimilarity }            from './SuggestionEngine.js';
export type {
  ProjectType, ProjectModel, Screen, UIElement, NavigationEdge,
  APIEndpoint, FormDefinition, FormField, AppFlow,
  TestCategory, TestSuggestion, DraftTestCase, DraftStep,
  GenerationOptions, GenerationResult, GenerationMeta,
  DuplicateCheckResult,
  GenerationMode, ContextGenerationOptions, GenerationScope,
}                                                         from './types.js';
export {
  GENERATION_MODE_CATEGORIES,
  GENERATION_MODE_LABELS,
  GENERATION_MODE_DESCRIPTIONS,
}                                                         from './types.js';
