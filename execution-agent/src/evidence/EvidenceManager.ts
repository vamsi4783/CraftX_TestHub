// ─── EvidenceManager ─────────────────────────────────────────────────────────
// Owns the full evidence lifecycle:
//   collect() → enqueue → upload() → status transition → metrics
//
// No Supabase calls here. All storage goes through IArtifactStore.
// Retry scheduling: EvidenceManager sets retryCount and transitions failed items
// back to pending when the caller invokes retry(). No internal timer.

import { uuidv7 }                    from 'uuidv7';
import { buildStoragePath }           from './StoragePathBuilder.js';
import { EvidenceQueue }              from './EvidenceQueue.js';
import type { EvidenceUploader }     from './EvidenceUploader.js';
import type { EvidenceMetricsHooks } from './EvidenceMetrics.js';
import { NOOP_EVIDENCE_METRICS }     from './EvidenceMetrics.js';
import type {
  EvidenceCreateRequest,
  EvidenceCollectionContext,
  EvidenceQueueItem,
  EvidenceUploadResult,
}                                     from './EvidenceTypes.js';
import type { EvidenceType }         from './EvidenceMetadata.js';
import { StructuredLogger }           from '../logging/StructuredLogger.js';

export class EvidenceManager {
  private readonly queue  = new EvidenceQueue();
  private readonly logger = new StructuredLogger('EvidenceManager');

  constructor(
    private readonly uploader: EvidenceUploader,
    private readonly metrics:  EvidenceMetricsHooks = NOOP_EVIDENCE_METRICS,
  ) {}

  // ─── Collection ───────────────────────────────────────────────────────────

  /**
   * Create an evidence item, enqueue it, and fire the evidence_created metric.
   * Returns the evidenceId (UUID v7) assigned to this item.
   * Does NOT upload — call upload() or uploadAll() separately.
   */
  async collect(request: EvidenceCreateRequest): Promise<string> {
    const evidenceId  = uuidv7();
    const enqueuedAt  = new Date().toISOString();
    const capturedAt  = request.capturedAt ?? enqueuedAt;

    const path = buildStoragePath({
      organizationId: request.organizationId,
      projectId:      request.projectId,
      executionId:    request.executionId,
      stepId:         request.stepId,
      evidenceId,
      mimeType:       request.mimeType,
    });

    const item: EvidenceQueueItem = {
      queueId:    uuidv7(),
      evidenceId,
      request:    Object.freeze({ ...request, capturedAt }),
      path,
      enqueuedAt,
      status:     'pending',
      retryCount: 0,
    };

    this.queue.enqueue(item);
    this.metrics.evidence_created(evidenceId, request.evidenceType, request.data.byteLength);

    this.logger.info('evidence_collected', {
      evidence_id:   evidenceId,
      evidence_type: request.evidenceType,
      path,
      size_bytes:    request.data.byteLength,
    });

    return evidenceId;
  }

  // ─── Convenience collectors ────────────────────────────────────────────────

  /** Collect a screenshot buffer. */
  async collectScreenshot(
    screenshot:   Buffer,
    evidenceType: EvidenceType,
    ctx:          EvidenceCollectionContext,
  ): Promise<string> {
    return this.collect({ ...ctx, evidenceType, mimeType: 'image/png', data: screenshot });
  }

  /** Collect a log as plain text. */
  async collectLog(
    log:          string | Buffer,
    evidenceType: EvidenceType,
    ctx:          EvidenceCollectionContext,
  ): Promise<string> {
    const data = Buffer.isBuffer(log) ? log : Buffer.from(log, 'utf8');
    return this.collect({ ...ctx, evidenceType, mimeType: 'text/plain', data });
  }

  /** Collect a DOM or accessibility snapshot as XML/HTML. */
  async collectDom(
    content:      string | Buffer,
    mimeType:     'text/html' | 'application/xml',
    evidenceType: EvidenceType,
    ctx:          EvidenceCollectionContext,
  ): Promise<string> {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    return this.collect({ ...ctx, evidenceType, mimeType, data });
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  /**
   * Upload a specific evidence item by ID.
   * Transitions: pending → uploading → uploaded | failed.
   * On failure: increments retryCount; caller decides whether to retry.
   */
  async upload(evidenceId: string): Promise<EvidenceUploadResult> {
    const item = this.queue.get(evidenceId);
    if (!item) {
      return {
        evidenceId,
        success:        false,
        duration_ms:    0,
        error:          `Evidence "${evidenceId}" not found in queue`,
        retryScheduled: false,
      };
    }

    if (item.status !== 'pending' && item.status !== 'failed') {
      return {
        evidenceId,
        success:        item.status === 'uploaded',
        duration_ms:    0,
        url:            item.uploadUrl,
        retryScheduled: false,
      };
    }

    this.queue.transition(evidenceId, 'uploading');

    const result = await this.uploader.upload(item);

    if (result.success) {
      this.queue.transition(evidenceId, 'uploaded');
      item.uploadedAt  = new Date().toISOString();
      item.uploadUrl   = result.url;
    } else {
      this.queue.transition(evidenceId, 'failed');
      item.retryCount++;
      item.lastFailureReason = result.error;
    }

    return result;
  }

  /**
   * Upload all pending items in FIFO order.
   * Continues on failure — collects all results.
   */
  async uploadAll(): Promise<EvidenceUploadResult[]> {
    const pending = this.queue.pending();
    const results: EvidenceUploadResult[] = [];
    for (const item of pending) {
      results.push(await this.upload(item.evidenceId));
    }
    return results;
  }

  /**
   * Re-queue a failed item for retry.
   * Transitions status from failed → pending.
   * Callers call upload() again after this to attempt re-upload.
   */
  retry(evidenceId: string): void {
    const item = this.queue.get(evidenceId);
    if (!item || item.status !== 'failed') return;
    this.queue.transition(evidenceId, 'pending');
    this.logger.info('evidence_retry_queued', {
      evidence_id: evidenceId,
      retry_count: item.retryCount,
    });
  }

  // ─── Introspection ────────────────────────────────────────────────────────

  getItem(evidenceId: string): EvidenceQueueItem | undefined {
    return this.queue.get(evidenceId);
  }

  getQueue(): EvidenceQueueItem[] {
    return this.queue.all();
  }

  pendingCount(): number  { return this.queue.pending().length; }
  uploadedCount(): number { return this.queue.uploaded().length; }
  failedCount(): number   { return this.queue.failed().length; }
  totalCount(): number    { return this.queue.size(); }
}
