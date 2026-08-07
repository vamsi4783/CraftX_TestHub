export type UserRole = 'administrator' | 'developer' | 'qa_tester' | 'viewer';
export type ProjectStatus = 'active' | 'inactive' | 'archived';
export type ProjectPlatform = 'android' | 'ios' | 'web' | 'desktop' | 'backend' | 'cross_platform';
export type ReleaseStatus = 'planning' | 'testing' | 'ready' | 'released' | 'archived';
export type TcPriority = 'critical' | 'high' | 'medium' | 'low';
export type TcStatus = 'draft' | 'active' | 'deprecated';
export type AssignmentStatus = 'pending' | 'in_progress' | 'completed';
export type ResultStatus = 'pass' | 'fail' | 'blocked' | 'skipped' | 'not_tested';
export type BugSeverity = 'critical' | 'high' | 'medium' | 'low';
export type BugPriority = 'p1' | 'p2' | 'p3' | 'p4';
export type BugStatus = 'new' | 'triaged' | 'assigned' | 'in_progress' | 'ready_for_qa' | 'retesting' | 'verified' | 'closed' | 'rejected' | 'duplicate' | 'cannot_reproduce' | 'wont_fix';
export type BugRelationshipType = 'duplicate_of' | 'blocks' | 'blocked_by' | 'related' | 'parent' | 'child';
export type ReleaseBuildPlatform = 'android_apk' | 'android_aab' | 'ios_ipa' | 'web' | 'desktop' | 'other';
export type ReleaseDocType = 'user_manual' | 'developer_handbook' | 'qa_guide' | 'release_notes' | 'known_issues' | 'test_report' | 'changelog' | 'other';
export type QAApprovalStatus = 'pending' | 'approved' | 'rejected' | 'needs_more_testing';
export type FeaturePriority = 'critical' | 'high' | 'medium' | 'low';
export type FeatureStatus = 'submitted' | 'under_review' | 'approved' | 'in_progress' | 'completed' | 'rejected' | 'deferred';
export type ReadinessVerdict = 'not_ready' | 'ready_with_risks' | 'ready_for_release';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  platform: ProjectPlatform;
  status: ProjectStatus;
  owner_id: string;
  version: string;
  repository_url: string | null;
  color: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // joined
  owner?: Profile;
  member_count?: number;
  open_bugs?: number;
  active_releases?: number;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: UserRole;
  joined_at: string;
  profile?: Profile;
}

export interface Release {
  id: string;
  project_id: string;
  name: string;
  version: string;
  build_number: string | null;
  status: ReleaseStatus;
  start_date: string | null;
  end_date: string | null;
  release_notes: string | null;
  known_issues: string | null;
  description: string | null;
  created_by: string;
  cloned_from: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // joined
  creator?: Profile;
  project?: Project;
  readiness?: ReleaseReadiness;
}

export interface ReleaseReadiness {
  testing_percentage: number;
  pass_rate: number;
  total_bugs: number;
  critical_bugs: number;
  open_bugs: number;
  verdict: ReadinessVerdict;
  total_tests: number;
  completed_tests: number;
}

export interface Module {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  order_index: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  // joined
  test_case_count?: number;
  open_bug_count?: number;
}

export interface TestCase {
  id: string;
  project_id: string;
  module_id: string | null;
  test_id: string;
  title: string;
  description: string | null;
  priority: TcPriority;
  status: TcStatus;
  estimated_minutes: number;
  is_automation_ready: boolean;
  preconditions: string | null;
  tags: string[];
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  module?: Module;
  steps?: TestCaseStep[];
  creator?: Profile;
}

// ─── Automation Configuration (Phase 4 M1) ───────────────────────────────────

export type AutomationAction =
  | 'tap' | 'swipe' | 'type_text' | 'wait'
  | 'launch_app' | 'assertion' | 'screenshot'
  | 'press_back' | 'press_key'
  | 'navigate' | 'click' | 'fill' | 'scroll';

export type AutomationDriverId = 'android' | 'browser';

/** M1 legacy — kept for backwards-compat */
export type AssertionTypeLegacy =
  | 'text_present' | 'element_visible' | 'package' | 'activity' | 'screenshot';

/** M4 + M5 — full assertion kind set matching AssertionEngine */
export type AssertionType =
  // Android
  | 'assert_activity'
  | 'assert_package'
  | 'assert_text'
  | 'assert_view_exists'
  | 'assert_screenshot_exists'
  // Chrome
  | 'assert_element_exists'
  | 'assert_text_exists'
  | 'assert_attribute'
  | 'assert_url'
  | 'assert_title'
  // Common
  | 'assert_wait_until'
  | 'assert_value_equals'
  | 'assert_regex_match'
  // Visual (M5)
  | 'assert_visual_match';

export type VisualComparisonMode =
  | 'exact'
  | 'pixel_tolerance'
  | 'percentage_difference'
  | 'ignore_regions'
  | 'resolution_normalization';

export interface AutomationParams {
  // tap / assertion element target
  x?: number;
  y?: number;
  // swipe end point
  x2?: number;
  y2?: number;
  // type_text value or launch_app package
  value?: string;
  // wait or swipe gesture duration
  duration_ms?: number;
  // assertion (M4 + M5)
  assertion_kind?: AssertionType;
  expected?: string;
  selector?: string;
  attribute?: string;
  regex?: string;
  negate?: boolean;
  poll_interval_ms?: number;
  // visual (M5)
  baseline_id?: string;
  visual_mode?: VisualComparisonMode;
  tolerance?: number;
  threshold?: number;
  ignore_regions?: Array<{ x: number; y: number; width: number; height: number; label?: string }>;
  capture_baseline?: boolean;
  // press_key
  key?: string;
  // per-step timeout override
  timeout_ms?: number;
}

export interface AutomationConfig {
  driver_id: AutomationDriverId;
  action: AutomationAction;
  params: AutomationParams;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface TestCaseStep {
  id: string;
  test_case_id: string;
  step_number: number;
  description: string;
  expected_result: string;
  notes: string | null;
  automation_config: AutomationConfig | null;
  created_at: string;
  updated_at: string;
}

export interface TestAssignment {
  id: string;
  test_case_id: string;
  release_id: string;
  assigned_to: string;
  assigned_by: string;
  priority: TcPriority;
  deadline: string | null;
  status: AssignmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  test_case?: TestCase;
  release?: Release;
  assignee?: Profile;
  assigner?: Profile;
  latest_result?: TestResult;
}

export interface TestResult {
  id: string;
  assignment_id: string;
  test_case_id: string;
  release_id: string;
  executed_by: string;
  status: ResultStatus;
  duration_minutes: number | null;
  notes: string | null;
  environment: string | null;
  device_info: string | null;
  executed_at: string;
  created_at: string;
  executor?: Profile;
}

export interface Bug {
  id: string;
  project_id: string;
  release_id: string | null;
  module_id: string | null;
  test_case_id: string | null;
  test_result_id: string | null;
  test_plan_id: string | null;
  test_session_id: string | null;
  bug_id: string;
  title: string;
  description: string;
  severity: BugSeverity;
  priority: BugPriority;
  status: BugStatus;
  assigned_to: string | null;
  reported_by: string;
  device: string | null;
  os_version: string | null;
  app_version: string | null;
  build_number: string | null;
  browser: string | null;
  environment: string;
  steps_to_reproduce: string | null;
  expected_result: string | null;
  actual_result: string | null;
  root_cause: string | null;
  resolution_notes: string | null;
  fix_version: string | null;
  commit_ref: string | null;
  pull_request: string | null;
  files_changed: string | null;
  logs: string | null;
  is_regression: boolean;
  duplicate_of: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  closed_at: string | null;
  retested_by: string | null;
  retested_at: string | null;
  watcher_count: number;
  created_at: string;
  updated_at: string;
  // joined
  reporter?: Profile;
  assignee?: Profile;
  retester?: Profile;
  module?: Module;
  release?: Release;
  project?: Project;
  comment_count?: number;
  relationships?: BugRelationship[];
  attachments?: BugAttachment[];
}

export interface BugRelationship {
  id: string;
  bug_id: string;
  related_bug_id: string;
  relationship: BugRelationshipType;
  created_by: string;
  created_at: string;
  related_bug?: Pick<Bug, 'id' | 'bug_id' | 'title' | 'status' | 'severity'>;
  creator?: Profile;
}

export interface BugAttachment {
  id: string;
  bug_id: string;
  comment_id: string | null;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
  uploader?: Profile;
}

export interface ReleaseBuild {
  id: string;
  release_id: string;
  platform: ReleaseBuildPlatform;
  file_name: string;
  file_url: string;
  file_size: number | null;
  checksum: string | null;
  version: string;
  build_number: string | null;
  notes: string | null;
  is_latest: boolean;
  uploaded_by: string;
  created_at: string;
  uploader?: Profile;
}

export interface ReleaseDocument {
  id: string;
  release_id: string;
  doc_type: ReleaseDocType;
  name: string;
  description: string | null;
  file_name: string;
  file_url: string;
  file_size: number | null;
  version: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  uploader?: Profile;
}

export interface QAApprovalChecklist {
  critical_bugs_closed: boolean;
  required_tests_executed: boolean;
  coverage_target_reached: boolean;
  no_blocked_tests: boolean;
  release_notes_completed: boolean;
  known_issues_documented: boolean;
  regression_passed: boolean;
}

export interface QAApproval {
  id: string;
  release_id: string;
  status: QAApprovalStatus;
  approved_by: string | null;
  checklist: QAApprovalChecklist;
  notes: string | null;
  action_taken_at: string | null;
  created_at: string;
  updated_at: string;
  approver?: Profile;
}

export interface BugComment {
  id: string;
  bug_id: string;
  user_id: string;
  content: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
  user?: Profile;
}

export interface BugHistory {
  id: string;
  bug_id: string;
  changed_by: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changer?: Profile;
}

export interface FeatureRequest {
  id: string;
  project_id: string;
  title: string;
  description: string;
  business_value: string | null;
  category: string | null;
  priority: FeaturePriority;
  status: FeatureStatus;
  vote_count: number;
  submitted_by: string;
  assigned_to: string | null;
  roadmap_link: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // joined
  submitter?: Profile;
  has_voted?: boolean;
  project?: Project;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  project_id: string | null;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
  user?: Profile;
}

// ============================================================
// Test Management Engine Types
// ============================================================
export type TestPlanStatus = 'draft' | 'active' | 'completed' | 'archived';
export type TestSessionStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
export type ExecutionStatus = 'in_progress' | 'pass' | 'fail' | 'blocked' | 'skipped' | 'not_tested' | 'abandoned';
export type StepResultStatus = 'pass' | 'fail' | 'blocked' | 'skipped' | 'not_tested';

export interface TestPlan {
  id: string;
  project_id: string;
  release_id: string | null;
  name: string;
  description: string | null;
  status: TestPlanStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  // joined
  project?: Project;
  release?: Release;
  creator?: Profile;
  case_count?: number;
  cases?: TestPlanCase[];
}

export interface TestPlanCase {
  id: string;
  plan_id: string;
  test_case_id: string;
  order_index: number;
  created_at: string;
  test_case?: TestCase;
}

export interface TestSession {
  id: string;
  plan_id: string | null;
  project_id: string;
  release_id: string | null;
  name: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  start_date: string | null;
  end_date: string | null;
  status: TestSessionStatus;
  progress_pct: number;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  blocked_cases: number;
  skipped_cases: number;
  current_case_id: string | null;
  current_step_index: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  project?: Project;
  release?: Release;
  plan?: TestPlan;
  assignee?: Profile;
  assigner?: Profile;
  cases?: TestSessionCase[];
}

export interface TestSessionCase {
  id: string;
  session_id: string;
  test_case_id: string;
  order_index: number;
  status: StepResultStatus | 'pending' | 'in_progress' | 'not_tested';
  execution_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  test_case?: TestCase;
  execution?: TestExecution;
}

export interface TestExecution {
  id: string;
  session_id: string;
  session_case_id: string | null;
  test_case_id: string;
  project_id: string;
  release_id: string | null;
  executed_by: string;
  status: ExecutionStatus;
  notes: string | null;
  environment: string;
  device_info: string | null;
  app_version: string | null;
  build_number: string | null;
  duration_seconds: number;
  step_snapshot: unknown;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  test_case?: TestCase;
  executor?: Profile;
  step_results?: ExecutionStepResult[];
  attachments?: ExecutionAttachment[];
}

export interface ExecutionStepResult {
  id: string;
  execution_id: string;
  step_id: string | null;
  step_number: number;
  step_description: string | null;
  expected_result: string | null;
  status: StepResultStatus;
  actual_result: string | null;
  notes: string | null;
  bug_id: string | null;
  created_at: string;
  updated_at: string;
  bug?: Bug;
}

export interface ExecutionAttachment {
  id: string;
  execution_id: string;
  step_result_id: string | null;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

// Dashboard stats
export interface DashboardStats {
  total_projects: number;
  active_releases: number;
  open_bugs: number;
  critical_bugs: number;
  assigned_tests: number;
  completed_tests: number;
  passed_tests: number;
  feature_requests: number;
}
