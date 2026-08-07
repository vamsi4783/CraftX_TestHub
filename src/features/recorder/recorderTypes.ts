// ─── Recorder Types (web app mirror of execution-agent/src/recorder/RecorderTypes) ──
// Kept in sync manually. No circular imports from execution-agent.

export const RECORDER_VERSION = '1.0.0' as const;
export const SCHEMA_VERSION   = '1.0'   as const;

export const ANDROID_ACTIONS = [
  'tap', 'swipe', 'type_text', 'press_back', 'press_key', 'launch_app', 'wait',
] as const;

export const CHROME_ACTIONS = [
  'navigate', 'click', 'fill', 'scroll', 'wait',
] as const;

export type AndroidAction    = typeof ANDROID_ACTIONS[number];
export type ChromeAction     = typeof CHROME_ACTIONS[number];
export type RecordableAction = AndroidAction | ChromeAction;
export type RecordableDriver = 'android' | 'browser';

export interface RecordedParams {
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  value?: string;
  duration_ms?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  selector?: string;
  timeout_ms?: number;
  [key: string]: unknown;
}

export interface RecordedStepMetadata {
  created_by:       string;
  created_at:       string;
  recorder_version: string;
  source:           'recorder';
  [key: string]: unknown;
}

export interface RecordedStep {
  id:             string;
  schema_version: typeof SCHEMA_VERSION;
  driver:         RecordableDriver;
  action:         RecordableAction;
  params:         RecordedParams;
  metadata:       RecordedStepMetadata;
}

export interface RecorderConfig {
  userId:        string;
  defaultDriver: RecordableDriver;
}

// ─── Action metadata for UI ───────────────────────────────────────────────────

export interface ActionUIMeta {
  label:       string;
  drivers:     RecordableDriver[];
  description: string;
  paramHints:  string[];
}

export const ACTION_UI_META: Record<RecordableAction, ActionUIMeta> = {
  tap:        { label: 'Tap',        drivers: ['android'],           description: 'Tap a point on screen',                paramHints: ['x', 'y'] },
  swipe:      { label: 'Swipe',      drivers: ['android'],           description: 'Swipe from one coordinate to another', paramHints: ['x', 'y', 'x2', 'y2', 'duration_ms'] },
  type_text:  { label: 'Type Text',  drivers: ['android'],           description: 'Type text into the focused field',     paramHints: ['value'] },
  press_back: { label: 'Press Back', drivers: ['android'],           description: 'Press the Android back button',        paramHints: [] },
  press_key:  { label: 'Press Key',  drivers: ['android'],           description: 'Press a hardware or system key',       paramHints: ['value'] },
  launch_app: { label: 'Launch App', drivers: ['android'],           description: 'Launch an app by package name',        paramHints: ['value'] },
  navigate:   { label: 'Navigate',   drivers: ['browser'],           description: 'Navigate to a URL',                    paramHints: ['value'] },
  click:      { label: 'Click',      drivers: ['browser'],           description: 'Click an element by CSS selector',     paramHints: ['selector'] },
  fill:       { label: 'Fill',       drivers: ['browser'],           description: 'Fill an input field',                  paramHints: ['selector', 'value'] },
  scroll:     { label: 'Scroll',     drivers: ['browser'],           description: 'Scroll the page',                      paramHints: ['direction', 'amount'] },
  wait:       { label: 'Wait',       drivers: ['android', 'browser'],description: 'Pause for a fixed duration',           paramHints: ['duration_ms'] },
  screenshot: { label: 'Screenshot', drivers: ['android', 'browser'],description: 'Capture a screenshot',                 paramHints: [] },
  assertion:  { label: 'Assertion',  drivers: ['android', 'browser'],description: 'Assert UI state',                      paramHints: [] },
};
