// ─── Visual Comparison Engine — Types (Phase 4 M5) ────────────────────────────

import type { AssertionParams, AssertionResult, AssertionEvidence } from '../assertions/AssertionTypes.js';

// ─── Modes ────────────────────────────────────────────────────────────────────

export type VisualComparisonMode =
  | 'exact'
  | 'pixel_tolerance'
  | 'percentage_difference'
  | 'ignore_regions'
  | 'resolution_normalization';

// ─── Geometry ─────────────────────────────────────────────────────────────────

export interface BoundingBox {
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

export interface IgnoreRegion {
  x:      number;
  y:      number;
  width:  number;
  height: number;
  label?: string;
}

// ─── Comparison output ────────────────────────────────────────────────────────

export interface VisualComparisonMetrics {
  mode:            VisualComparisonMode;
  /** Number of pixels that differ (after tolerance). */
  diffPixels:      number;
  /** Total comparable pixels. */
  totalPixels:     number;
  /** diffPixels / totalPixels * 100, rounded to 4 decimal places. */
  diffPercent:     number;
  /** Configured threshold (% of pixels allowed to differ). */
  threshold:       number;
  /** Per-channel color tolerance used (0–255). */
  tolerance:       number;
  /** Bounding boxes of changed regions. */
  boundingBoxes:   BoundingBox[];
  baselineWidth:   number;
  baselineHeight:  number;
  currentWidth:    number;
  currentHeight:   number;
  /** True when current was resized to match baseline dimensions. */
  resized:         boolean;
  /** Number of ignore regions applied. */
  ignoredRegions:  number;
}

export interface VisualComparisonOutput {
  match:        boolean;
  metrics:      VisualComparisonMetrics;
  /** PNG buffer — diff pixels highlighted in red. */
  diffImage:    Buffer;
  /** PNG buffer — side-by-side blend of baseline (left) and current (right). */
  overlayImage: Buffer;
}

// ─── Baseline ────────────────────────────────────────────────────────────────

export interface BaselineMetadata {
  key:           string;   // storage key, e.g. "{testCaseId}/{stepId}"
  capturedAt:    string;   // ISO 8601
  width:         number;
  height:        number;
  sizeBytes:     number;
  driverKind:    string;
  note?:         string;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface VisualAssertionResult extends AssertionResult {
  visual?:           VisualComparisonMetrics;
  baselineKey?:      string;
  evidenceBaseline?: AssertionEvidence;
  evidenceCurrent?:  AssertionEvidence;
  evidenceDiff?:     AssertionEvidence;
  evidenceOverlay?:  AssertionEvidence;
}

// ─── Params (carried in AutomationConfig.params when action==='assertion') ────

export interface VisualAssertionParams extends AssertionParams {
  assertion_kind:    'assert_visual_match';
  /**
   * Unique key for the stored baseline. Defaults to `stepId` when omitted.
   * Use a stable value (e.g. "login-screen") so baselines survive step ID
   * regeneration.
   */
  baseline_id?:       string;
  mode?:              VisualComparisonMode;
  /** 0–255 per-channel color difference allowed per pixel (pixel_tolerance mode). */
  tolerance?:         number;
  /**
   * % of pixels allowed to differ before FAIL (percentage_difference mode).
   * Also used as the upper bound in exact and pixel_tolerance modes (default 0).
   */
  threshold?:         number;
  ignore_regions?:    IgnoreRegion[];
  /**
   * When true: capture the current screenshot as the new baseline and return
   * PASS. Use this for first-run or intentional baseline replacement.
   */
  capture_baseline?:  boolean;
}
