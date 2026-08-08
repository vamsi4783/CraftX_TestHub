// ─── AI Test Generation Engine — Types (Phase 4 M6) ──────────────────────────
// All generated tests reuse the existing TestCase / TestCaseStep / AutomationConfig
// domain model. No duplicate models.

import type { TcPriority, AutomationConfig } from '@/types';

// ─── Project analysis ─────────────────────────────────────────────────────────

export type ProjectType = 'android' | 'react' | 'flutter' | 'generic';

export type UIElementType =
  | 'button' | 'input' | 'form' | 'list'
  | 'text'   | 'image' | 'navigation' | 'other';

export interface UIElement {
  type:         UIElementType;
  id?:          string;
  label?:       string;
  required?:    boolean;
  validations?: string[];
}

export interface NavigationEdge {
  targetScreen: string;
  trigger:      string;  // "button click", "back", "deep link", etc.
}

export interface Screen {
  name:        string;
  type:        'activity' | 'fragment' | 'component' | 'page' | 'view' | 'screen';
  elements:    UIElement[];
  navigation:  NavigationEdge[];
  sourceFile?: string;
}

export interface APIEndpoint {
  method:       string;
  path:         string;
  description?: string;
  sourceFile?:  string;
}

export interface FormField {
  name:         string;
  type:         string;  // "text", "email", "password", "number", etc.
  required?:    boolean;
  validations?: string[];
}

export interface FormDefinition {
  name:       string;
  screen?:    string;
  fields:     FormField[];
  sourceFile?: string;
}

export interface NavigationStep {
  from:    string;
  to:      string;
  trigger: string;
}

export interface AppFlow {
  name:       string;
  steps:      NavigationStep[];
  startScreen: string;
  endScreen?:  string;
}

export interface ProjectModel {
  projectType:        ProjectType;
  projectName?:       string;
  screens:            Screen[];
  apis:               APIEndpoint[];
  flows:              AppFlow[];
  forms:              FormDefinition[];
  sourceFiles:        string[];
  /** 0–1: how much structure was detected. Low confidence = generic output. */
  analysisConfidence: number;
  analysisNotes?:     string[];
}

// ─── Test generation ──────────────────────────────────────────────────────────

export type TestCategory =
  | 'smoke'
  | 'happy_path'
  | 'validation'
  | 'boundary'
  | 'negative'
  | 'permission'
  | 'navigation'
  | 'regression';

/** Draft step — mirrors Omit<TestCaseStep, 'id'|'test_case_id'|timestamps> */
export interface DraftStep {
  step_number:     number;
  description:     string;
  expected_result: string;
  notes:           string | null;
  automation_config: AutomationConfig | null;
}

/** Draft test case — mirrors Omit<TestCase, 'id'|'test_id'|timestamps|joined> */
export interface DraftTestCase {
  title:              string;
  description:        string | null;
  priority:           TcPriority;
  preconditions:      string | null;
  tags:               string[];
  is_automation_ready: boolean;
  estimated_minutes:  number;
  steps:              DraftStep[];
}

export interface TestSuggestion {
  /** UUID assigned at parse time — stable for the current generation session. */
  id:               string;
  draft:            DraftTestCase;
  category:         TestCategory;
  /** Human-readable explanation of why this test was generated. */
  reason:           string;
  /** Source files or screens that informed the suggestion. */
  sourceFiles:      string[];
  /** 0–1 confidence in relevance/accuracy. */
  confidence:       number;
  /** Area of the app this test covers (e.g. "Login Screen", "API /auth"). */
  coverageArea:     string;
  /** Set by SuggestionEngine after duplicate detection. */
  isDuplicate:      boolean;
  duplicateOf?:     string;   // title of the similar existing test
  duplicateSimilarity?: number;  // 0–1
  /** User decision. Starts as 'pending'. */
  status:           'pending' | 'accepted' | 'rejected';
}

// ─── Generation request / result ──────────────────────────────────────────────

export interface GenerationOptions {
  categories:    TestCategory[];
  maxSuggestions?: number;
  language?:     string;  // "en" default
}

// ─── M11: Generation modes ─────────────────────────────────────────────────────

export type GenerationMode =
  | 'full_suite'
  | 'functional'
  | 'ui'
  | 'regression'
  | 'negative_edge'
  | 'security'
  | 'module_specific';

export const GENERATION_MODE_CATEGORIES: Record<GenerationMode, TestCategory[]> = {
  full_suite:      ['smoke', 'happy_path', 'validation', 'boundary', 'negative', 'navigation', 'regression'],
  functional:      ['happy_path', 'validation', 'boundary'],
  ui:              ['smoke', 'navigation', 'validation'],
  regression:      ['regression', 'smoke'],
  negative_edge:   ['negative', 'boundary', 'permission'],
  security:        ['permission', 'negative'],
  module_specific: ['smoke', 'happy_path', 'validation', 'negative'],
};

export const GENERATION_MODE_LABELS: Record<GenerationMode, string> = {
  full_suite:      'Full Suite',
  functional:      'Functional',
  ui:              'UI',
  regression:      'Regression',
  negative_edge:   'Negative / Edge Case',
  security:        'Security',
  module_specific: 'Module Specific',
};

export const GENERATION_MODE_DESCRIPTIONS: Record<GenerationMode, string> = {
  full_suite:      'Comprehensive coverage: smoke, happy path, validation, boundary, negative, navigation, and regression tests.',
  functional:      'Core business logic: happy path flows, form validation, and boundary inputs.',
  ui:              'Interface coverage: smoke checks, navigation flows, and field-level validation.',
  regression:      'Critical path protection: regression tests and smoke checks for existing flows.',
  negative_edge:   'Failure modes: negative inputs, boundary extremes, and permission checks.',
  security:        'Access control and authorization: permission gating and unauthorized-action scenarios.',
  module_specific: 'Targeted coverage for a specific module: smoke, happy path, validation, and negative tests.',
};

/** Scope for context-based generation — drives ProjectContextQuery. */
export type GenerationScope = 'full' | 'module' | 'feature' | 'file';

/** Options for M11 Project-Intelligence-based generation. */
export interface ContextGenerationOptions {
  mode:            GenerationMode;
  scope:           GenerationScope;
  moduleIds?:      string[];      // when scope === 'module'
  feature?:        string;        // when scope === 'feature'
  filePaths?:      string[];      // when scope === 'file'
  maxSuggestions?: number;        // defaults to 20
}

export interface GenerationRequest {
  projectModel:       ProjectModel;
  options:            GenerationOptions;
  existingTestTitles: string[];
}

export interface GenerationMeta {
  screensAnalyzed:  number;
  flowsAnalyzed:    number;
  formsAnalyzed:    number;
  apisAnalyzed:     number;
  generationTime_ms: number;
  model:            string;
}

export interface GenerationResult {
  suggestions:  TestSuggestion[];
  meta:         GenerationMeta;
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

export interface DuplicateCheckResult {
  isDuplicate:  boolean;
  duplicateOf?: string;
  similarity:   number;  // 0–1
}
