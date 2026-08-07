// ─── Evidence Pipeline — Shared Types ────────────────────────────────────────

import type { DeviceContext, AppContext, DriverContext, EvidenceType } from './EvidenceMetadata.js';

// ─── Evidence creation ────────────────────────────────────────────────────────

/** Caller-supplied context common to all evidence collection. */
export interface EvidenceCollectionContext {
  executionId:    string;
  stepId:         string;
  stepNumber:     number;
  sessionId:      string;
  organizationId: string;
  projectId:      string;
  device:         DeviceContext;
  app:            AppContext;
  driver:         DriverContext;
  stepStatus:     'running' | 'failed' | 'completed';
  stepDuration_ms: number;
}

/** Full request to create a new evidence item. */
export interface EvidenceCreateRequest extends EvidenceCollectionContext {
  evidenceType: EvidenceType;
  mimeType:     string;
  data:         Buffer;
  /** ISO8601Z — defaults to now(). Set by EvidenceManager if omitted. */
  capturedAt?:  string;
}

// ─── Queue item ───────────────────────────────────────────────────────────────

export type EvidenceStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

/** An item in the EvidenceQueue. Metadata and data are frozen after enqueue. */
export interface EvidenceQueueItem {
  /** UUID v7 — time-ordered queue insertion key. */
  readonly queueId:      string;
  /** UUID v7 — stable identity, used in the storage path. */
  readonly evidenceId:   string;
  /** Immutable snapshot of the create request. */
  readonly request:      Readonly<EvidenceCreateRequest>;
  /** Deterministic storage path: org/project/execution/step/evidenceId.ext */
  readonly path:         string;
  readonly enqueuedAt:   string;   // ISO8601Z

  // Mutable lifecycle fields — only EvidenceManager writes these
  status:              EvidenceStatus;
  retryCount:          number;
  uploadedAt?:         string;   // ISO8601Z
  uploadUrl?:          string;
  lastFailureReason?:  string;
}

// ─── Upload result ────────────────────────────────────────────────────────────

export interface EvidenceUploadResult {
  evidenceId:      string;
  success:         boolean;
  url?:            string;
  path?:           string;
  sizeBytes?:      number;
  duration_ms:     number;
  error?:          string;
  retryScheduled:  boolean;
  retryDelayMs?:   number;
}
