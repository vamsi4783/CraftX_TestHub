// ─── Recorder Types (Phase 4 M2) ─────────────────────────────────────────────
// Pure data types for the Recorder module.
// No UI dependencies. No driver dependencies.

export const RECORDER_VERSION = '1.0.0' as const;
export const SCHEMA_VERSION   = '1.0'   as const;

// ─── Supported actions per driver ────────────────────────────────────────────

export const ANDROID_ACTIONS = [
  'tap', 'swipe', 'type_text', 'press_back', 'press_key', 'launch_app', 'wait',
] as const;

export const CHROME_ACTIONS = [
  'navigate', 'click', 'fill', 'scroll', 'wait',
] as const;

export type AndroidAction = typeof ANDROID_ACTIONS[number];
export type ChromeAction  = typeof CHROME_ACTIONS[number];
export type RecordableAction = AndroidAction | ChromeAction;
export type RecordableDriver = 'android' | 'browser';

// ─── Params ───────────────────────────────────────────────────────────────────

export interface RecordedParams {
  // tap / click / swipe start
  x?: number;
  y?: number;
  // swipe end
  x2?: number;
  y2?: number;
  // type_text / fill / navigate / launch_app / press_key
  value?: string;
  // wait / swipe
  duration_ms?: number;
  // scroll direction + amount
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  // click / fill CSS selector (Chrome)
  selector?: string;
  // per-step timeout override
  timeout_ms?: number;
  // open field for driver-specific extras
  [key: string]: unknown;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export interface RecordedStepMetadata {
  created_by:       string;
  created_at:       string;   // ISO 8601
  recorder_version: string;
  source:           'recorder';
  // Reserved for future expansion (device info, screenshot id, etc.)
  [key: string]: unknown;
}

// ─── Recorded step ────────────────────────────────────────────────────────────

export interface RecordedStep {
  /** UUID v4 — stable identity even after reorder. */
  id:             string;
  schema_version: typeof SCHEMA_VERSION;
  driver:         RecordableDriver;
  action:         RecordableAction;
  params:         RecordedParams;
  metadata:       RecordedStepMetadata;
}

// ─── Session context ─────────────────────────────────────────────────────────

export interface RecorderConfig {
  /** Who is recording — used in metadata.created_by. */
  userId: string;
  /** Default driver for new steps. Can be overridden per-step. */
  defaultDriver: RecordableDriver;
}
