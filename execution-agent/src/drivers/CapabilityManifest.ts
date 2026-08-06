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
  | 'press_back'
  | 'install_apk'
  | 'uninstall_apk'
  // Chrome-specific
  | 'navigate'
  | 'click'
  | 'get_dom'
  | 'scroll'
  | 'wait_for_selector'
  | 'assert_text'
  | 'fill'
  | 'evaluate'
  | 'wait'
  // Shared advanced
  | 'accessibility_tree'
  // Phase 6+ — declared now so manifests are forward-compatible
  | 'ocr'
  | 'semantic_vision'
  | 'video_capture'
  | 'network_intercept';

/** Platform a driver targets. Used in DriverManifest.platforms. */
export type Platform = 'android' | 'chromium' | 'webkit' | 'firefox' | 'all';

export interface DriverManifest {
  driver_id: string;
  driver_name: string;
  version: string;
  capabilities: Set<Capability>;
  /** JSON Schema for the connect() config object. */
  config_schema: Record<string, unknown>;
  /** Platforms this driver targets. Optional for backwards-compat with M3 manifests. */
  platforms?: Platform[];
  /** Semver ranges of agent versions this driver is compatible with. */
  agent_compatibility?: string[];
  description?: string;
}
