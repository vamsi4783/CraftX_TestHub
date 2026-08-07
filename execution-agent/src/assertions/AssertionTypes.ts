// ─── Assertion Engine — Types (Phase 4 M4) ───────────────────────────────────

// ─── Assertion kinds ──────────────────────────────────────────────────────────

/** Android-specific assertion kinds. */
export type AndroidAssertionKind =
  | 'assert_activity'
  | 'assert_package'
  | 'assert_text'
  | 'assert_view_exists'
  | 'assert_screenshot_exists';

/** Chrome-specific assertion kinds. */
export type ChromeAssertionKind =
  | 'assert_element_exists'
  | 'assert_text_exists'
  | 'assert_attribute'
  | 'assert_url'
  | 'assert_title';

/** Driver-agnostic assertion kinds. */
export type CommonAssertionKind =
  | 'assert_wait_until'
  | 'assert_value_equals'
  | 'assert_regex_match';

/** M5 — visual comparison assertion. */
export type VisualAssertionKind = 'assert_visual_match';

export type AssertionKind =
  | AndroidAssertionKind
  | ChromeAssertionKind
  | CommonAssertionKind
  | VisualAssertionKind;

// ─── Assertion status ─────────────────────────────────────────────────────────

export type AssertionStatus = 'PASS' | 'FAIL' | 'ERROR' | 'SKIPPED';

// ─── Assertion evidence ───────────────────────────────────────────────────────

export type AssertionEvidenceType =
  | 'screenshot'
  | 'page_source'
  | 'activity_dump'
  | 'metadata';

export interface AssertionEvidence {
  type:        AssertionEvidenceType;
  data:        Buffer | string | Record<string, unknown>;
  capturedAt:  string;   // ISO 8601
  stepId:      string;
  metadata?:   Record<string, unknown>;
}

// ─── Assertion result ─────────────────────────────────────────────────────────

export interface AssertionResult {
  assertionKind:  AssertionKind;
  status:         AssertionStatus;
  /** The value we were checking against (from params). */
  expected:       string;
  /** The value actually observed from the driver. */
  actual:         string;
  /** Human-readable summary of what was checked and what happened. */
  message:        string;
  duration_ms:    number;
  evidenceId?:    string;
  evidence?:      AssertionEvidence;
  error?:         string;
  /** True when negate=true and the assertion was logically inverted. */
  negated?:       boolean;
}

// ─── Assertion config (params carried in AutomationConfig.params) ─────────────

export interface AssertionParams {
  /** Which assertion to evaluate. */
  assertion_kind:       AssertionKind;
  /** Expected value, text, URL, class name, package name, regex pattern, etc. */
  expected?:            string;
  /** CSS selector, XPath, resource-id, or other target. */
  selector?:            string;
  /** Attribute name — used by assert_attribute. */
  attribute?:           string;
  /** Regex pattern string — used by assert_regex_match. */
  regex?:               string;
  /** Value to compare — used by assert_value_equals. */
  value?:               string;
  /** Timeout for wait_until assertion (ms). Default: 5 000. */
  timeout_ms?:          number;
  /** Polling interval for wait_until assertion (ms). Default: 500. */
  poll_interval_ms?:    number;
  /** If true, PASS becomes FAIL and vice-versa. */
  negate?:              boolean;
}
