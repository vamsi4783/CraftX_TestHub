// ─── Evidence Model ──────────────────────────────────────────────────────────
// Full context captured at the moment evidence is created.
// Phase 5 Self-Healing and Phase 4 World Model consume all fields.
// These fields cannot be reconstructed after the fact — capture everything now.

export interface DeviceContext {
  device_model: string;     // "Google Pixel 7a"
  os_name: string;          // "Android" | "iOS" | "Web"
  os_version: string;       // "14.0" | "17.4" | "Chrome/126"
  screen_width_px: number;
  screen_height_px: number;
  orientation: 'portrait' | 'landscape';
}

export interface AppContext {
  app_package: string;      // "com.example.myapp" | URL for web targets
  app_version: string;      // "2.1.0"
  app_build: string;        // "1042"
}

export interface DriverContext {
  driver_id: string;        // "android_adb" | "chrome_cdp"
  driver_version: string;   // execution-agent package semver
  /** Snapshot of the driver's declared capabilities at time of capture. */
  driver_capabilities: string[];
}

export type EvidenceType =
  | 'failure_screenshot'    // automatic on StepFailed
  | 'manual_screenshot'     // tester-initiated via UI
  | 'final_screenshot'      // last step completion
  | 'auto_screenshot'       // all-steps mode (opt-in)
  | 'logcat_excerpt'        // Android logcat around failure window
  | 'dom_snapshot'          // Chrome HTML at time of failure
  | 'accessibility_tree'    // UI hierarchy XML (Android) or AX tree (Chrome)
  | 'video_clip';           // Phase 6

export interface EvidenceItem {
  // Identity
  evidence_id: string;              // UUID — also the Supabase Storage path component
  execution_id: string;
  step_id: string;
  step_number: number;
  evidence_type: EvidenceType;

  // Storage (path-stable: evidence/{org_id}/{project_id}/{evidence_id}.ext)
  file_url: string;
  file_type: string;                // "image/png" | "text/plain" | "application/xml"
  file_size_bytes: number;
  storage_tier: 'hot' | 'warm' | 'cold';  // 'hot' on insert; Phase 7 updates column

  // Execution context
  /** ISO8601Z — when captured, not when uploaded. */
  execution_timestamp: string;
  step_duration_ms: number;
  step_status_at_capture: 'running' | 'failed' | 'completed';

  // Environment context — the whole reason this model exists
  device: DeviceContext;
  app: AppContext;
  driver: DriverContext;

  // Archival
  archived_at: string | null;
  created_at: string;
}
