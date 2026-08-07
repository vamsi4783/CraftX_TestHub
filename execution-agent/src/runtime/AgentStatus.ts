// ─── AgentStatus ──────────────────────────────────────────────────────────────
// Snapshot of agent state at a point in time.
// Read-only — callers must not mutate the returned object.

import type { AgentState } from './AgentLifecycle.js';

export interface AgentStatus {
  readonly agentId:        string;
  readonly agentVersion:   string;
  readonly state:          AgentState;
  readonly startedAt:      string | null;   // ISO8601Z, null if not yet started
  readonly stoppedAt:      string | null;   // ISO8601Z, null if not yet stopped
  readonly uptimeMs:       number;          // 0 if not running
  readonly faultReason:    string | null;   // non-null only in Faulted
}
