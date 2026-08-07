// ─── Milestone 6: EvidenceUploader Tests ─────────────────────────────────────

import { EvidenceUploader }          from '../../evidence/EvidenceUploader.js';
import { InMemoryArtifactStore }     from '../../evidence/store/InMemoryArtifactStore.js';
import { NOOP_EVIDENCE_METRICS }     from '../../evidence/EvidenceMetrics.js';
import { DEFAULT_RETRY_POLICY,
         evaluateRetry }             from '../../evidence/retry/RetryTypes.js';
import type { RetryPolicy }          from '../../evidence/retry/RetryTypes.js';
import type { EvidenceQueueItem }    from '../../evidence/EvidenceTypes.js';
import type { EvidenceMetricsHooks } from '../../evidence/EvidenceMetrics.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<EvidenceQueueItem> = {}): EvidenceQueueItem {
  return {
    queueId:    'q-001',
    evidenceId: 'ev-001',
    request: Object.freeze({
      executionId:    'exec-001',
      stepId:         'step-001',
      stepNumber:     1,
      sessionId:      'sess-001',
      organizationId: 'org-001',
      projectId:      'proj-001',
      evidenceType:   'failure_screenshot',
      mimeType:       'image/png',
      data:           Buffer.from('fake-screenshot-bytes'),
      device:  { device_model: 'Pixel 7a', os_name: 'Android', os_version: '14', screen_width_px: 1080, screen_height_px: 2400, orientation: 'portrait' },
      app:     { app_package: 'com.example.app', app_version: '1.0.0', app_build: '42' },
      driver:  { driver_id: 'android_adb', driver_version: '1.0.0', driver_capabilities: ['tap'] },
      stepStatus: 'failed',
      stepDuration_ms: 500,
    }),
    path:       'org-001/proj-001/exec-001/step-001/ev-001.png',
    enqueuedAt: '2026-08-07T10:00:00Z',
    status:     'uploading',
    retryCount: 0,
    ...overrides,
  };
}

function makeUploader(store: InMemoryArtifactStore, policy?: RetryPolicy, metrics?: EvidenceMetricsHooks) {
  return new EvidenceUploader(store, policy ?? DEFAULT_RETRY_POLICY, metrics ?? NOOP_EVIDENCE_METRICS);
}

// ─── Upload success ───────────────────────────────────────────────────────────

describe('EvidenceUploader — upload success', () => {
  it('returns success: true when store.upload() succeeds', async () => {
    const store    = new InMemoryArtifactStore();
    const uploader = makeUploader(store);
    const result   = await uploader.upload(makeItem());
    expect(result.success).toBe(true);
  });

  it('result contains url', async () => {
    const store    = new InMemoryArtifactStore();
    const uploader = makeUploader(store);
    const result   = await uploader.upload(makeItem());
    expect(typeof result.url).toBe('string');
    expect(result.url!.length).toBeGreaterThan(0);
  });

  it('result contains path matching item.path', async () => {
    const store    = new InMemoryArtifactStore();
    const uploader = makeUploader(store);
    const item     = makeItem();
    const result   = await uploader.upload(item);
    expect(result.path).toBe(item.path);
  });

  it('result contains sizeBytes matching data.length', async () => {
    const store    = new InMemoryArtifactStore();
    const uploader = makeUploader(store);
    const result   = await uploader.upload(makeItem());
    expect(result.sizeBytes).toBe(Buffer.from('fake-screenshot-bytes').byteLength);
  });

  it('retryScheduled is false on success', async () => {
    const store    = new InMemoryArtifactStore();
    const uploader = makeUploader(store);
    const result   = await uploader.upload(makeItem());
    expect(result.retryScheduled).toBe(false);
  });

  it('duration_ms is non-negative', async () => {
    const store    = new InMemoryArtifactStore();
    const uploader = makeUploader(store);
    const result   = await uploader.upload(makeItem());
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('blob is stored at the correct path', async () => {
    const store    = new InMemoryArtifactStore();
    const uploader = makeUploader(store);
    const item     = makeItem();
    await uploader.upload(item);
    expect(await store.exists(item.path)).toBe(true);
  });

  it('stored blob content matches input data', async () => {
    const store    = new InMemoryArtifactStore();
    const uploader = makeUploader(store);
    const item     = makeItem();
    await uploader.upload(item);
    const stored = store.getBlob(item.path);
    expect(stored).toBeDefined();
    expect(stored!.equals(item.request.data)).toBe(true);
  });
});

// ─── Upload failure ───────────────────────────────────────────────────────────

describe('EvidenceUploader — upload failure', () => {
  it('returns success: false when store.upload() throws', async () => {
    const store    = new InMemoryArtifactStore();
    store.nextUploadError = new Error('network error');
    const uploader = makeUploader(store);
    const result   = await uploader.upload(makeItem());
    expect(result.success).toBe(false);
  });

  it('captures error message', async () => {
    const store    = new InMemoryArtifactStore();
    store.nextUploadError = new Error('specific upload failure');
    const uploader = makeUploader(store);
    const result   = await uploader.upload(makeItem());
    expect(result.error).toContain('specific upload failure');
  });

  it('evidenceId is preserved in failure result', async () => {
    const store    = new InMemoryArtifactStore();
    store.nextUploadError = new Error('x');
    const uploader = makeUploader(store);
    const result   = await uploader.upload(makeItem({ evidenceId: 'ev-fail' }));
    expect(result.evidenceId).toBe('ev-fail');
  });
});

// ─── Retry scheduling ─────────────────────────────────────────────────────────

describe('EvidenceUploader — retry scheduling', () => {
  const singleAttemptPolicy: RetryPolicy = {
    maxAttempts: 1, initialDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0,
  };

  const threeAttemptPolicy: RetryPolicy = {
    maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000,
  };

  it('retryScheduled is true when attempts remaining', async () => {
    const store    = new InMemoryArtifactStore();
    store.nextUploadError = new Error('network error');
    const uploader = makeUploader(store, threeAttemptPolicy);
    // retryCount = 0 means this is attempt 1 of 3
    const result   = await uploader.upload(makeItem({ retryCount: 0 }));
    expect(result.retryScheduled).toBe(true);
  });

  it('retryScheduled is false when maxAttempts reached', async () => {
    const store    = new InMemoryArtifactStore();
    store.nextUploadError = new Error('network error');
    const uploader = makeUploader(store, singleAttemptPolicy);
    const result   = await uploader.upload(makeItem({ retryCount: 0 }));
    expect(result.retryScheduled).toBe(false);
  });

  it('retryDelayMs increases with backoff', async () => {
    const store1 = new InMemoryArtifactStore();
    const store2 = new InMemoryArtifactStore();
    store1.nextUploadError = new Error('x');
    store2.nextUploadError = new Error('x');

    const uploader = makeUploader(store1, threeAttemptPolicy);
    const r1 = await uploader.upload(makeItem({ retryCount: 0 })); // attempt 1

    const uploader2 = makeUploader(store2, threeAttemptPolicy);
    const r2 = await uploader2.upload(makeItem({ retryCount: 1 })); // attempt 2

    // Both should schedule retries; second delay should be larger
    expect(r1.retryScheduled).toBe(true);
    expect(r2.retryScheduled).toBe(true);
    expect(r2.retryDelayMs!).toBeGreaterThan(r1.retryDelayMs!);
  });

  it('retryDelayMs is undefined when no retry scheduled', async () => {
    const store    = new InMemoryArtifactStore();
    store.nextUploadError = new Error('x');
    const uploader = makeUploader(store, singleAttemptPolicy);
    const result   = await uploader.upload(makeItem());
    expect(result.retryDelayMs).toBeUndefined();
  });
});

// ─── Metrics hooks ────────────────────────────────────────────────────────────

describe('EvidenceUploader — metrics hooks', () => {
  it('fires evidence_uploaded on success', async () => {
    const store = new InMemoryArtifactStore();
    const calls: string[] = [];
    const metrics: EvidenceMetricsHooks = {
      ...NOOP_EVIDENCE_METRICS,
      evidence_uploaded: () => { calls.push('evidence_uploaded'); },
    };
    await makeUploader(store, DEFAULT_RETRY_POLICY, metrics).upload(makeItem());
    expect(calls).toContain('evidence_uploaded');
  });

  it('fires upload_failed on failure', async () => {
    const store = new InMemoryArtifactStore();
    store.nextUploadError = new Error('boom');
    const calls: string[] = [];
    const metrics: EvidenceMetricsHooks = {
      ...NOOP_EVIDENCE_METRICS,
      upload_failed: () => { calls.push('upload_failed'); },
    };
    await makeUploader(store, DEFAULT_RETRY_POLICY, metrics).upload(makeItem());
    expect(calls).toContain('upload_failed');
  });

  it('fires retry_scheduled when retry is warranted', async () => {
    const store = new InMemoryArtifactStore();
    store.nextUploadError = new Error('boom');
    const calls: string[] = [];
    const metrics: EvidenceMetricsHooks = {
      ...NOOP_EVIDENCE_METRICS,
      retry_scheduled: () => { calls.push('retry_scheduled'); },
    };
    const policy: RetryPolicy = { maxAttempts: 3, initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 5000 };
    await makeUploader(store, policy, metrics).upload(makeItem({ retryCount: 0 }));
    expect(calls).toContain('retry_scheduled');
  });

  it('does NOT fire retry_scheduled when maxAttempts exhausted', async () => {
    const store = new InMemoryArtifactStore();
    store.nextUploadError = new Error('boom');
    const calls: string[] = [];
    const metrics: EvidenceMetricsHooks = {
      ...NOOP_EVIDENCE_METRICS,
      retry_scheduled: () => { calls.push('retry_scheduled'); },
    };
    const policy: RetryPolicy = { maxAttempts: 1, initialDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0 };
    await makeUploader(store, policy, metrics).upload(makeItem());
    expect(calls).not.toContain('retry_scheduled');
  });
});

// ─── RetryTypes.evaluateRetry ─────────────────────────────────────────────────

describe('evaluateRetry', () => {
  const policy: RetryPolicy = {
    maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000,
  };

  it('shouldRetry is true when attemptNumber < maxAttempts', () => {
    expect(evaluateRetry(policy, 1, 'network_error').shouldRetry).toBe(true);
    expect(evaluateRetry(policy, 2, 'network_error').shouldRetry).toBe(true);
  });

  it('shouldRetry is false when attemptNumber === maxAttempts', () => {
    expect(evaluateRetry(policy, 3, 'network_error').shouldRetry).toBe(false);
  });

  it('delayMs is 0 when not retrying', () => {
    expect(evaluateRetry(policy, 3, 'network_error').delayMs).toBe(0);
  });

  it('delayMs respects maxDelayMs cap', () => {
    const tinyPolicy: RetryPolicy = {
      maxAttempts: 10, initialDelayMs: 1000, backoffMultiplier: 10, maxDelayMs: 5000,
    };
    const result = evaluateRetry(tinyPolicy, 5, 'network_error');
    expect(result.delayMs).toBeLessThanOrEqual(5000);
  });

  it('preserves reason in result', () => {
    expect(evaluateRetry(policy, 1, 'auth_failure').reason).toBe('auth_failure');
  });

  it('preserves attemptNumber in result', () => {
    expect(evaluateRetry(policy, 2, 'timeout').attemptNumber).toBe(2);
  });
});
