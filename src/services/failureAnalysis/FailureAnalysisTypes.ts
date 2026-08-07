// ─── Failure Analysis Types (Phase 4 M8) ────────────────────────────────────

export type FailureCategory =
  | 'assertion_failure'
  | 'locator_failure'
  | 'timeout'
  | 'crash'
  | 'navigation'
  | 'permission'
  | 'visual_regression'
  | 'api_failure'
  | 'unknown';

export type RecommendationType =
  | 'update_locator'
  | 'fix_assertion'
  | 'increase_timeout'
  | 'file_bug'
  | 'check_permissions'
  | 'update_baseline'
  | 'check_network'
  | 'review_navigation'
  | 'enable_healing'
  | 'manual_review';

export type AnalysisStatus = 'pending' | 'analyzing' | 'complete' | 'failed';

// ─── Execution data ────────────────────────────────────────────────────────────

export interface StepSummary {
  stepId:     string;
  stepNumber: number;
  action:     string;
  selector?:  string;
  status:     'passed' | 'failed' | 'skipped';
  error?:     string;
  duration_ms: number;
  screenshotUrl?: string;
  healingAttempted?: boolean;
}

export interface AssertionSummary {
  id:             string;
  stepNumber:     number;
  assertionKind:  string;
  status:         'PASS' | 'FAIL' | 'ERROR' | 'SKIPPED';
  expected:       string;
  actual:         string;
  message:        string;
  error?:         string;
  evidenceUrl?:   string;
}

export interface HealingAttemptSummary {
  stepId:      string;
  stepNumber:  number;
  outcome:     'healed' | 'failed' | 'not_applicable';
  strategyUsed?: string;
  confidence?: number;
  originalLocator?: string;
  resolvedLocator?: string;
}

export interface DeviceInfo {
  platform:      string;
  os_version?:   string;
  device_name?:  string;
  driver_id?:    string;
}

export interface ExecutionSummary {
  runId:         string;
  testCaseId?:   string;
  testCaseName?: string;
  status:        string;
  totalSteps:    number;
  passedSteps:   number;
  failedSteps:   number;
  skippedSteps:  number;
  duration_ms:   number;
  error?:        string;
  startedAt:     string;
  completedAt?:  string;
  deviceInfo?:   DeviceInfo;
  buildVersion?: string;
  environment?:  string;
  steps:         StepSummary[];
  failedStepList: StepSummary[];
  assertions:    AssertionSummary[];
  healingAttempts: HealingAttemptSummary[];
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export type EvidenceType = 'screenshot' | 'visual_diff' | 'log' | 'exception' | 'assertion_evidence';

export interface Evidence {
  id:        string;
  type:      EvidenceType;
  stepNumber?: number;
  url?:      string;
  content?:  string;
  metadata?: Record<string, unknown>;
}

// ─── Classification ────────────────────────────────────────────────────────────

export interface ClassificationResult {
  category:    FailureCategory;
  confidence:  number;
  signals:     string[];
  subCategory?: string;
}

// ─── AI Analysis ──────────────────────────────────────────────────────────────

export interface AIAnalysisResult {
  rootCause:               string;
  confidence:              number;
  evidenceSummary:         string;
  likelySourceFiles:       string[];
  suggestedFix:            string;
  suggestedHealing?:       string;
  regressionProbability:   number;
  developerExplanation:    string;
  qaExplanation:           string;
  rawResponse?:            string;
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export interface Recommendation {
  id:                   string;
  type:                 RecommendationType;
  priority:             'critical' | 'high' | 'medium' | 'low';
  title:                string;
  description:          string;
  actionable:           boolean;
  requiresUserApproval: boolean;
  metadata?:            Record<string, unknown>;
}

// ─── Previous failure ─────────────────────────────────────────────────────────

export interface PreviousFailure {
  runId:           string;
  category:        FailureCategory;
  createdAt:       string;
  resolved:        boolean;
}

// ─── Full report ──────────────────────────────────────────────────────────────

export interface AnalysisReport {
  id:                  string;
  runId:               string;
  testCaseId?:         string;
  createdAt:           string;
  status:              AnalysisStatus;
  classification:      ClassificationResult;
  executionSummary:    ExecutionSummary;
  evidence:            Evidence[];
  aiAnalysis:          AIAnalysisResult | null;
  recommendations:     Recommendation[];
  previousFailures:    PreviousFailure[];
}

// ─── Context for AI ───────────────────────────────────────────────────────────

export interface AnalysisContext {
  runId:          string;
  testCaseName:   string;
  classification: ClassificationResult;
  summary:        ExecutionSummary;
  evidence:       Evidence[];
  previousFailures: PreviousFailure[];
}
