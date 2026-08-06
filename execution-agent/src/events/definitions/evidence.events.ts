// ─── Evidence Event Payload Types ────────────────────────────────────────────

import type { EvidenceType } from '../../evidence/EvidenceMetadata.js';

export interface EvidenceCapturedPayload {
  evidence_id: string;
  execution_id: string;
  step_id: string;
  step_number: number;
  evidence_type: EvidenceType;
  /** Path-stable URL in Supabase Storage. */
  url: string;
  file_size_bytes: number;
}
