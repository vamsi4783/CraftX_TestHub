// ─── Driver Capability Manifests ────────────────────────────────────────────
// Every driver declares its capabilities via a DriverManifest.
// The Execution Engine queries manifests before dispatch — no hardcoded
// assumptions about what any driver can do.

export type Capability =
  // Universal interaction
  | 'tap'
  | 'swipe'
  | 'type_text'
  | 'press_key'
  | 'screenshot'
  // Android-specific
  | 'get_ui_hierarchy'
  | 'launch_app'
  | 'wait_for_element'
  | 'logcat_capture'
  | 'crash_detection'
  | 'anr_detection'
  // Chrome-specific
  | 'navigate'
  | 'click'
  | 'get_dom'
  | 'scroll'
  | 'wait_for_selector'
  | 'assert_text'
  // Shared advanced
  | 'accessibility_tree'
  // Phase 6+ — declared now so manifests are forward-compatible
  | 'ocr'
  | 'semantic_vision'
  | 'video_capture'
  | 'network_intercept';

export interface DriverManifest {
  driver_id: string;
  driver_name: string;
  version: string;
  capabilities: Set<Capability>;
  /** JSON Schema for the connect() config object. */
  config_schema: Record<string, unknown>;
}
