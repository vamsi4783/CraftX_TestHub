// ─── Evidence Metrics Hooks ───────────────────────────────────────────────────
// Interface-only. No backend in Phase 3.
// Phase 6: swap NOOP_EVIDENCE_METRICS for a Prometheus/OTel implementation.

import type { EvidenceType } from './EvidenceMetadata.js';

export interface EvidenceMetricsHooks {
  /** Fired when evidence is enqueued (before upload). */
  evidence_created(evidenceId: string, evidenceType: EvidenceType, sizeBytes: number): void;
  /** Fired when evidence is successfully persisted to the artifact store. */
  evidence_uploaded(evidenceId: string, path: string, duration_ms: number): void;
  /** Fired when an upload attempt fails. */
  upload_failed(evidenceId: string, reason: string, attemptNumber: number): void;
  /** Fired when a retry is scheduled (but not yet executed). */
  retry_scheduled(evidenceId: string, delayMs: number, attemptNumber: number): void;
}

export const NOOP_EVIDENCE_METRICS: EvidenceMetricsHooks = {
  evidence_created:  () => { /* no-op */ },
  evidence_uploaded: () => { /* no-op */ },
  upload_failed:     () => { /* no-op */ },
  retry_scheduled:   () => { /* no-op */ },
};
