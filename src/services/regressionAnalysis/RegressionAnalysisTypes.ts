// ─── Regression Analysis Types (Phase 4 M9) ──────────────────────────────────

import type { ProjectModel } from '@/services/aiTestGenerator/types';

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface CommitInfo {
  hash:    string;
  message: string;
  author?: string;
  date?:   string;
}

export interface ChangeSet {
  fromVersion:  string;
  toVersion:    string;
  changedFiles: string[];
  commits?:     CommitInfo[];
  projectType?: 'android' | 'ios' | 'react' | 'api' | 'generic';
  projectModel?: ProjectModel;
}

// ─── Change classification ────────────────────────────────────────────────────

export type ChangeCategory =
  | 'screen_layout'
  | 'navigation'
  | 'business_logic'
  | 'api_endpoint'
  | 'data_model'
  | 'configuration'
  | 'styling'
  | 'infrastructure'
  | 'test'
  | 'unknown';

export interface ClassifiedFile {
  path:      string;
  category:  ChangeCategory;
  moduleName: string;  // inferred from path
  weight:    number;   // 0-1: how impactful this type of change is
}

// ─── Impact ───────────────────────────────────────────────────────────────────

export interface ImpactedArea {
  id:        string;
  name:      string;
  type:      'screen' | 'api' | 'flow' | 'module';
  files:     string[];
  category:  ChangeCategory;
  directChange: boolean; // true = file directly changed; false = propagated
  riskFactor:  number;  // raw weight before scoring, 0-1
}

// ─── Dependency graph ─────────────────────────────────────────────────────────

export interface DependencyNode {
  id:           string;
  name:         string;
  type:         'screen' | 'api' | 'module';
  dependencies: string[]; // IDs this node depends on
  dependents:   string[]; // IDs that depend on this node
  impacted:     boolean;
  files:        string[];
}

// ─── Coverage ─────────────────────────────────────────────────────────────────

export interface CoverageResult {
  areaId:        string;
  areaName:      string;
  testCaseCount: number;
  stepCount:     number;
  covered:       boolean;
  coverageScore: number; // 0-1
  testCaseIds:   string[];
}

// ─── Risk ─────────────────────────────────────────────────────────────────────

export type RiskTier = 'critical' | 'high' | 'medium' | 'low';

export interface RiskFactors {
  changeWeight:  number; // 0-1: direct change impact
  failureRate:   number; // 0-1: historical failure rate for this area
  coverageGap:   number; // 0-1: 1 = no coverage, 0 = fully covered
  healingRate:   number; // 0-1: self-healing frequency (instability signal)
}

export interface RiskScore {
  areaId:   string;
  areaName: string;
  score:    number; // 0-1
  tier:     RiskTier;
  factors:  RiskFactors;
}

// ─── Regression suggestions ───────────────────────────────────────────────────

export interface RegressionSuggestion {
  testCaseId:    string;
  testCaseName:  string;
  priority:      number; // 1 = highest
  riskScore:     number;
  tier:          RiskTier;
  reasons:       string[];
  estimatedTime: number; // seconds
  coverageAreas: string[];
}

// ─── AI insights ──────────────────────────────────────────────────────────────

export interface AIRegressionInsight {
  likelyRegressionAreas:  string[];
  untestedScenarios:      string[];
  suggestedRegressionSuite: string[];
  highRiskModules:        string[];
  developerExplanation:   string;
  qaExplanation:          string;
  confidence:             number;
  rawResponse?:           string;
}

// ─── Report summary ───────────────────────────────────────────────────────────

export interface RegressionSummary {
  totalChangedFiles:   number;
  impactedScreens:     number;
  impactedAPIs:        number;
  coverageGapPct:      number; // % areas with no test coverage
  criticalCount:       number;
  highCount:           number;
  suggestedTestCount:  number;
  estimatedTotalTime:  number; // seconds
  overallRisk:         number; // 0-1
}

// ─── Full report ──────────────────────────────────────────────────────────────

export interface RegressionReport {
  id:             string;
  fromVersion:    string;
  toVersion:      string;
  createdAt:      string;
  changeSet:      ChangeSet;
  classifiedFiles: ClassifiedFile[];
  impactedAreas:  ImpactedArea[];
  dependencyGraph: DependencyNode[];
  coverageResults: CoverageResult[];
  riskScores:     RiskScore[];
  suggestions:    RegressionSuggestion[];
  aiInsights:     AIRegressionInsight | null;
  summary:        RegressionSummary;
}

// ─── DB row ───────────────────────────────────────────────────────────────────

export interface RegressionReportRow {
  id:             string;
  from_version:   string;
  to_version:     string;
  changed_files:  string[];
  overall_risk:   number;
  critical_count: number;
  high_count:     number;
  suggested_test_count: number;
  estimated_total_time: number;
  report_json:    string; // full serialized report
  created_at:     string;
  created_by?:    string;
}

// ─── Context for AI ───────────────────────────────────────────────────────────

export interface RegressionAIContext {
  fromVersion:    string;
  toVersion:      string;
  changedFiles:   string[];
  impactedAreas:  ImpactedArea[];
  riskScores:     RiskScore[];
  coverageResults: CoverageResult[];
  commitMessages: string[];
  projectType:    string;
}


// ─── Historical metrics (referenced by RiskScoringEngine & callers) ───────────

export interface HistoricalMetrics {
  failureRates: Map<string, number>; // areaName → 0-1
  healingRates: Map<string, number>; // areaName → 0-1
}
