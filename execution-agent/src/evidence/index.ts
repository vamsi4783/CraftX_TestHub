// ─── Evidence barrel export ───────────────────────────────────────────────────

// Existing metadata model
export type {
  DeviceContext,
  AppContext,
  DriverContext,
  EvidenceType,
  EvidenceItem,
} from './EvidenceMetadata.js';

// New pipeline types
export type {
  EvidenceCollectionContext,
  EvidenceCreateRequest,
  EvidenceQueueItem,
  EvidenceStatus,
  EvidenceUploadResult,
} from './EvidenceTypes.js';

// Storage path builder
export { buildStoragePath, mimeTypeToExtension } from './StoragePathBuilder.js';
export type { StoragePathParams }                from './StoragePathBuilder.js';

// Metrics
export type { EvidenceMetricsHooks }             from './EvidenceMetrics.js';
export { NOOP_EVIDENCE_METRICS }                 from './EvidenceMetrics.js';

// Retry contracts
export type { RetryPolicy, RetryResult, RetryReason } from './retry/RetryTypes.js';
export {
  DEFAULT_RETRY_POLICY,
  evaluateRetry,
  classifyError,
}                                                from './retry/RetryTypes.js';

// Artifact store
export type { IArtifactStore, ArtifactUploadResult } from './store/IArtifactStore.js';
export { InMemoryArtifactStore }                 from './store/InMemoryArtifactStore.js';
export { SupabaseArtifactStore }                 from './store/SupabaseArtifactStore.js';

// Pipeline
export { EvidenceQueue, EvidenceImmutabilityError } from './EvidenceQueue.js';
export { EvidenceUploader }                      from './EvidenceUploader.js';
export { EvidenceManager }                       from './EvidenceManager.js';
