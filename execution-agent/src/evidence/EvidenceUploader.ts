// ─── EvidenceUploader ─────────────────────────────────────────────────────────
// Pure upload executor: takes path + data, calls IArtifactStore, returns result.
// Status transitions and queue mutation are owned by EvidenceManager.
// Retry scheduling: evaluates RetryPolicy and returns retry decision in result.
// No timer, no scheduler — callers decide when/whether to act on retryScheduled.

import type { IArtifactStore }       from './store/IArtifactStore.js';
import type { EvidenceQueueItem,
              EvidenceUploadResult } from './EvidenceTypes.js';
import type { EvidenceMetricsHooks } from './EvidenceMetrics.js';
import {
  evaluateRetry,
  classifyError,
  DEFAULT_RETRY_POLICY,
}                                     from './retry/RetryTypes.js';
import type { RetryPolicy }           from './retry/RetryTypes.js';
import { NOOP_EVIDENCE_METRICS }     from './EvidenceMetrics.js';
import { StructuredLogger }           from '../logging/StructuredLogger.js';

export class EvidenceUploader {
  private readonly logger = new StructuredLogger('EvidenceUploader');

  constructor(
    private readonly store:       IArtifactStore,
    private readonly retryPolicy: RetryPolicy              = DEFAULT_RETRY_POLICY,
    private readonly metrics:     EvidenceMetricsHooks     = NOOP_EVIDENCE_METRICS,
  ) {}

  /**
   * Attempt to upload a single evidence item.
   * Always resolves — store exceptions are captured into the result.
   *
   * @param item  Queue item (read-only from uploader's perspective).
   * @returns     EvidenceUploadResult including retry decision on failure.
   */
  async upload(item: EvidenceQueueItem): Promise<EvidenceUploadResult> {
    const t0           = Date.now();
    const attemptNumber = item.retryCount + 1;

    this.logger.info('evidence_upload_start', {
      evidence_id:     item.evidenceId,
      path:            item.path,
      attempt_number:  attemptNumber,
      size_bytes:      item.request.data.byteLength,
    });

    try {
      const result = await this.store.upload(
        item.path,
        item.request.data,
        item.request.mimeType,
      );

      const duration_ms = Date.now() - t0;

      this.metrics.evidence_uploaded(item.evidenceId, item.path, duration_ms);

      this.logger.info('evidence_upload_success', {
        evidence_id:  item.evidenceId,
        path:         item.path,
        duration_ms,
        url:          result.url,
      });

      return {
        evidenceId:     item.evidenceId,
        success:        true,
        url:            result.url,
        path:           result.path,
        sizeBytes:      result.size_bytes,
        duration_ms,
        retryScheduled: false,
      };

    } catch (err: unknown) {
      const duration_ms  = Date.now() - t0;
      const errorMsg     = err instanceof Error ? err.message : String(err);
      const reason       = classifyError(err);
      const retryResult  = evaluateRetry(this.retryPolicy, attemptNumber, reason);

      this.metrics.upload_failed(item.evidenceId, errorMsg, attemptNumber);

      if (retryResult.shouldRetry) {
        this.metrics.retry_scheduled(item.evidenceId, retryResult.delayMs, attemptNumber + 1);
      }

      this.logger.error('evidence_upload_failed', {
        evidence_id:     item.evidenceId,
        path:            item.path,
        attempt_number:  attemptNumber,
        error:           errorMsg,
        retry_scheduled: retryResult.shouldRetry,
        retry_delay_ms:  retryResult.delayMs,
        duration_ms,
      });

      return {
        evidenceId:      item.evidenceId,
        success:         false,
        duration_ms,
        error:           errorMsg,
        retryScheduled:  retryResult.shouldRetry,
        retryDelayMs:    retryResult.shouldRetry ? retryResult.delayMs : undefined,
      };
    }
  }
}
