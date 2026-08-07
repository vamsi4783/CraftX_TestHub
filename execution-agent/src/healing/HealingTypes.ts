// ─── Healing Types (Phase 4 M7) ───────────────────────────────────────────────
// All types for the SelfHealingEngine. No AI — deterministic heuristics only.

import type { ExecutionStep } from '../execution/ExecutionTypes.js';
import type { IDriver }       from '../drivers/IDriver.js';

// ─── Locator ──────────────────────────────────────────────────────────────────

/** The type of selector string used by a driver. */
export type LocatorStrategy =
  | 'resource-id'       // Android: resource-id
  | 'xpath'             // Android/Web: XPath expression
  | 'css'               // Web: CSS selector
  | 'text'              // Android/Web: visible text content
  | 'accessibility-id'  // Android: content-desc / Web: aria-label
  | 'class-name'        // Android: class name
  | 'id'                // Web: #id
  | 'relative-position' // Logical: left-of / right-of / above / below
  | 'nearby-element'    // Logical: within N px of a sibling
  | 'unknown';

export interface Locator {
  strategy:   LocatorStrategy;
  value:      string;
  /** Driver that this locator targets. */
  driverId?:  string;
}

// ─── Healing strategy ─────────────────────────────────────────────────────────

/**
 * The 10 supported healing strategies.
 * Each maps to an IHealingStrategy implementation.
 */
export type HealingStrategyKind =
  | 'element_id_changed'
  | 'button_text_changed'
  | 'relative_position_shift'
  | 'xpath_fallback'
  | 'css_selector_fallback'
  | 'accessibility_label_fallback'
  | 'nearby_element_similarity'
  | 'retry_with_wait'
  | 'scroll_then_retry'
  | 'visibility_retry';

export interface HealingCapability {
  kind:       HealingStrategyKind;
  /** 1 (cheapest) — 10 (most expensive in terms of driver calls). */
  retryCost:  number;
  /** Numeric rank used by the registry. Lower = tried first. */
  priority:   number;
}

// ─── Candidate ────────────────────────────────────────────────────────────────

export interface LocatorCandidate {
  locator:     Locator;
  /** 0–1: how confident we are this candidate resolves the target. */
  confidence:  number;
  /** Human-readable explanation of why this candidate was produced. */
  explanation: string;
  /** Strategy that produced this candidate. */
  strategy:    HealingStrategyKind;
}

// ─── Healing result ───────────────────────────────────────────────────────────

export type HealingOutcome = 'healed' | 'failed' | 'not_applicable';

export interface HealingResult {
  outcome:          HealingOutcome;
  strategyUsed?:    HealingStrategyKind;
  originalLocator?: Locator;
  resolvedLocator?: Locator;
  confidence?:      number;
  explanation?:     string;
  retryCount:       number;
  /** ISO 8601 — when healing was attempted. */
  attemptedAt:      string;
  /** Screenshot taken before healing (if available). */
  screenshotBefore?: Buffer;
  /** Screenshot taken after successful healing. */
  screenshotAfter?:  Buffer;
  /** Error from the original failure that triggered healing. */
  originalError:    string;
  alternatives:     LocatorCandidate[];
}

// ─── Healing event (stored in DB + in-memory report) ─────────────────────────

export interface HealingEvent {
  id:               string;
  runId:            string;
  stepId:           string;
  stepNumber:       number;
  result:           HealingResult;
  /** Whether the user has reviewed this healing event. */
  reviewed:         boolean;
  /** User decision after review. */
  userDecision?:    'accepted' | 'rejected';
  /** ISO 8601. */
  createdAt:        string;
}

// ─── Plugin interface (used to inject SelfHealingEngine into the runner) ──────

export interface ISelfHealingPlugin {
  /**
   * Called when a step fails. Returns a healed result or null if
   * healing is not applicable / fails.
   *
   * The runner retries the step once with the resolved locator if outcome === 'healed'.
   */
  tryHeal(
    step:        ExecutionStep,
    driver:      IDriver,
    error:       string,
    runId:       string,
    sessionId:   string,
  ): Promise<HealingResult>;

  /** Record of all healing events in the current run. */
  readonly events: HealingEvent[];
}
