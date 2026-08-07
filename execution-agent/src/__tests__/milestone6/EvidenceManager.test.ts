// ─── Milestone 6: EvidenceManager Tests ──────────────────────────────────────

import { EvidenceManager }           from '../../evidence/EvidenceManager.js';
import { EvidenceUploader }          from '../../evidence/EvidenceUploader.js';
import { InMemoryArtifactStore }     from '../../evidence/store/InMemoryArtifactStore.js';
import { buildStoragePath }          from '../../evidence/StoragePathBuilder.js';
import { DEFAULT_RETRY_POLICY }      from '../../evidence/retry/RetryTypes.js';
import { NOOP_EVIDENCE_METRICS }     from '../../evidence/EvidenceMetrics.js';
import type { EvidenceCreateRequest,
              EvidenceCollectionContext } from '../../evidence/EvidenceTypes.js';
import type { EvidenceMetricsHooks } from '../../evidence/EvidenceMetrics.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<EvidenceCollectionContext> = {}): EvidenceCollectionContext {
  return {
    executionId:    'exec-001',
    stepId:         'step-001',
    stepNumber:     1,
    sessionId:      'sess-001',
    organizationId: 'org-001',
    projectId:      'proj-001',
    device:  { device_model: 'Pixel 7a', os_name: 'Android', os_version: '14', screen_width_px: 1080, screen_height_px: 2400, orientation: 'portrait' },
    app:     { app_package: 'com.example.app', app_version: '1.0.0', app_build: '42' },
    driver:  { driver_id: 'android_adb', driver_version: '1.0.0', driver_capabilities: ['tap'] },
    stepStatus:      'failed',
    stepDuration_ms: 500,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<EvidenceCreateRequest> = {}): EvidenceCreateRequest {
  return {
    ...makeCtx(),
    evidenceType: 'failure_screenshot',
    mimeType:     'image/png',
    data:         Buffer.from('fake-screenshot'),
    ...overrides,
  };
}

function makeRig(storeOverride?: InMemoryArtifactStore) {
  const store    = storeOverride ?? new InMemoryArtifactStore();
  const uploader = new EvidenceUploader(store, DEFAULT_RETRY_POLICY, NOOP_EVIDENCE_METRICS);
  const manager  = new EvidenceManager(uploader, NOOP_EVIDENCE_METRICS);
  return { store, uploader, manager };
}

// ─── collect() ────────────────────────────────────────────────────────────────

describe('EvidenceManager.collect', () => {
  it('returns a non-empty evidenceId string', async () => {
    const { manager } = makeRig();
    const id = await manager.collect(makeRequest());
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('each call returns a unique evidenceId', async () => {
    const { manager } = makeRig();
    const id1 = await manager.collect(makeRequest());
    const id2 = await manager.collect(makeRequest());
    expect(id1).not.toBe(id2);
  });

  it('totalCount() increases after collect', async () => {
    const { manager } = makeRig();
    await manager.collect(makeRequest());
    await manager.collect(makeRequest());
    expect(manager.totalCount()).toBe(2);
  });

  it('item is enqueued with status pending', async () => {
    const { manager } = makeRig();
    const id = await manager.collect(makeRequest());
    expect(manager.getItem(id)?.status).toBe('pending');
  });

  it('item path follows org/project/execution/step/evidenceId.ext', async () => {
    const { manager } = makeRig();
    const ctx = makeCtx({ organizationId: 'myorg', projectId: 'myproj', executionId: 'myexec', stepId: 'mystep' });
    const id  = await manager.collect({ ...ctx, evidenceType: 'failure_screenshot', mimeType: 'image/png', data: Buffer.from('x') });
    const item = manager.getItem(id)!;
    expect(item.path).toMatch(/^myorg\/myproj\/myexec\/mystep\//);
    expect(item.path).toMatch(/\.png$/);
  });

  it('item.request is immutable (Object.isFrozen)', async () => {
    const { manager } = makeRig();
    const id = await manager.collect(makeRequest());
    expect(Object.isFrozen(manager.getItem(id)!.request)).toBe(true);
  });

  it('capturedAt defaults to now when not supplied', async () => {
    const { manager } = makeRig();
    const before = new Date().toISOString();
    const id     = await manager.collect(makeRequest());
    const after  = new Date().toISOString();
    const { capturedAt } = manager.getItem(id)!.request;
    expect(capturedAt! >= before).toBe(true);
    expect(capturedAt! <= after).toBe(true);
  });

  it('capturedAt is preserved when supplied', async () => {
    const { manager } = makeRig();
    const ts = '2026-01-01T00:00:00.000Z';
    const id  = await manager.collect(makeRequest({ capturedAt: ts }));
    expect(manager.getItem(id)!.request.capturedAt).toBe(ts);
  });
});

// ─── collectScreenshot / collectLog ───────────────────────────────────────────

describe('EvidenceManager convenience collectors', () => {
  it('collectScreenshot creates evidence with mimeType image/png', async () => {
    const { manager } = makeRig();
    const id = await manager.collectScreenshot(Buffer.from('png'), 'failure_screenshot', makeCtx());
    expect(manager.getItem(id)!.request.mimeType).toBe('image/png');
    expect(manager.getItem(id)!.request.evidenceType).toBe('failure_screenshot');
  });

  it('collectLog creates evidence with mimeType text/plain (string)', async () => {
    const { manager } = makeRig();
    const id = await manager.collectLog('log text', 'logcat_excerpt', makeCtx());
    expect(manager.getItem(id)!.request.mimeType).toBe('text/plain');
    expect(manager.getItem(id)!.request.evidenceType).toBe('logcat_excerpt');
  });

  it('collectLog accepts Buffer input', async () => {
    const { manager } = makeRig();
    const buf = Buffer.from('log data');
    const id  = await manager.collectLog(buf, 'logcat_excerpt', makeCtx());
    expect(manager.getItem(id)!.request.data.equals(buf)).toBe(true);
  });

  it('collectDom creates evidence with mimeType text/html', async () => {
    const { manager } = makeRig();
    const id = await manager.collectDom('<html/>', 'text/html', 'dom_snapshot', makeCtx());
    expect(manager.getItem(id)!.request.mimeType).toBe('text/html');
  });
});

// ─── upload() ─────────────────────────────────────────────────────────────────

describe('EvidenceManager.upload', () => {
  it('returns success: true and item status becomes uploaded', async () => {
    const { manager } = makeRig();
    const id     = await manager.collect(makeRequest());
    const result = await manager.upload(id);
    expect(result.success).toBe(true);
    expect(manager.getItem(id)!.status).toBe('uploaded');
  });

  it('blob is stored at the correct path', async () => {
    const { manager, store } = makeRig();
    const id   = await manager.collect(makeRequest());
    const item = manager.getItem(id)!;
    await manager.upload(id);
    expect(await store.exists(item.path)).toBe(true);
  });

  it('item.uploadUrl is set after successful upload', async () => {
    const { manager } = makeRig();
    const id = await manager.collect(makeRequest());
    await manager.upload(id);
    expect(manager.getItem(id)!.uploadUrl).toBeDefined();
  });

  it('uploadedCount() increases after successful upload', async () => {
    const { manager } = makeRig();
    const id = await manager.collect(makeRequest());
    await manager.upload(id);
    expect(manager.uploadedCount()).toBe(1);
  });

  it('returns success: false and item status becomes failed when store throws', async () => {
    const store = new InMemoryArtifactStore();
    store.nextUploadError = new Error('upload failed');
    const { manager } = makeRig(store);
    const id     = await manager.collect(makeRequest());
    const result = await manager.upload(id);
    expect(result.success).toBe(false);
    expect(manager.getItem(id)!.status).toBe('failed');
  });

  it('retryCount is incremented on failure', async () => {
    const store = new InMemoryArtifactStore();
    store.nextUploadError = new Error('x');
    const { manager } = makeRig(store);
    const id = await manager.collect(makeRequest());
    await manager.upload(id);
    expect(manager.getItem(id)!.retryCount).toBe(1);
  });

  it('lastFailureReason is set on failure', async () => {
    const store = new InMemoryArtifactStore();
    store.nextUploadError = new Error('network error');
    const { manager } = makeRig(store);
    const id = await manager.collect(makeRequest());
    await manager.upload(id);
    expect(manager.getItem(id)!.lastFailureReason).toContain('network error');
  });

  it('returns a "not found" result for unknown evidenceId', async () => {
    const { manager } = makeRig();
    const result = await manager.upload('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('re-upload of already uploaded item is idempotent (returns success)', async () => {
    const { manager } = makeRig();
    const id = await manager.collect(makeRequest());
    await manager.upload(id);
    const result2 = await manager.upload(id); // already uploaded
    expect(result2.success).toBe(true);
  });
});

// ─── uploadAll() ──────────────────────────────────────────────────────────────

describe('EvidenceManager.uploadAll', () => {
  it('uploads all pending items', async () => {
    const { manager } = makeRig();
    await manager.collect(makeRequest());
    await manager.collect(makeRequest());
    await manager.collect(makeRequest());
    const results = await manager.uploadAll();
    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
  });

  it('returns results in FIFO order', async () => {
    const { manager } = makeRig();
    const id1 = await manager.collect(makeRequest());
    const id2 = await manager.collect(makeRequest());
    const results = await manager.uploadAll();
    expect(results[0].evidenceId).toBe(id1);
    expect(results[1].evidenceId).toBe(id2);
  });

  it('uploadedCount() equals number of successful uploads after uploadAll()', async () => {
    const { manager } = makeRig();
    await manager.collect(makeRequest());
    await manager.collect(makeRequest());
    await manager.uploadAll();
    expect(manager.uploadedCount()).toBe(2);
  });

  it('continues uploading remaining items after one failure', async () => {
    const store = new InMemoryArtifactStore();
    const { manager } = makeRig(store);

    const id1 = await manager.collect(makeRequest());
    const id2 = await manager.collect(makeRequest()); // will fail
    const id3 = await manager.collect(makeRequest());

    // Fail only the second upload
    const origUpload = store.upload.bind(store);
    let calls = 0;
    store.upload = async (path, data, mime) => {
      calls++;
      if (calls === 2) throw new Error('second upload fails');
      return origUpload(path, data, mime);
    };

    const results = await manager.uploadAll();
    expect(results).toHaveLength(3);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(true);
    void id1; void id2; void id3;
  });
});

// ─── retry() ─────────────────────────────────────────────────────────────────

describe('EvidenceManager.retry', () => {
  it('transitions failed item back to pending', async () => {
    const store = new InMemoryArtifactStore();
    store.nextUploadError = new Error('x');
    const { manager } = makeRig(store);
    const id = await manager.collect(makeRequest());
    await manager.upload(id); // → failed
    manager.retry(id);
    expect(manager.getItem(id)!.status).toBe('pending');
  });

  it('is a no-op for a non-failed item', async () => {
    const { manager } = makeRig();
    const id = await manager.collect(makeRequest());
    await manager.upload(id); // → uploaded
    manager.retry(id); // no-op
    expect(manager.getItem(id)!.status).toBe('uploaded');
  });

  it('item can be re-uploaded after retry()', async () => {
    const store = new InMemoryArtifactStore();
    store.nextUploadError = new Error('first attempt fails');
    const { manager } = makeRig(store);
    const id = await manager.collect(makeRequest());
    await manager.upload(id); // → failed
    manager.retry(id);        // → pending again
    const result = await manager.upload(id); // store is healthy now
    expect(result.success).toBe(true);
  });
});

// ─── Metrics hooks ────────────────────────────────────────────────────────────

describe('EvidenceManager — metrics hooks', () => {
  it('fires evidence_created on collect()', async () => {
    const calls: string[] = [];
    const metrics: EvidenceMetricsHooks = {
      ...NOOP_EVIDENCE_METRICS,
      evidence_created: () => { calls.push('evidence_created'); },
    };
    const store    = new InMemoryArtifactStore();
    const uploader = new EvidenceUploader(store);
    const manager  = new EvidenceManager(uploader, metrics);
    await manager.collect(makeRequest());
    expect(calls).toContain('evidence_created');
  });
});

// ─── Storage path determinism ─────────────────────────────────────────────────

describe('EvidenceManager — storage path', () => {
  it('path matches buildStoragePath for same inputs', async () => {
    const { manager } = makeRig();
    const req = makeRequest({
      organizationId: 'org-test',
      projectId:      'proj-test',
      executionId:    'exec-test',
      stepId:         'step-test',
      mimeType:       'image/png',
    });
    const id   = await manager.collect(req);
    const item = manager.getItem(id)!;
    const expected = buildStoragePath({
      organizationId: 'org-test',
      projectId:      'proj-test',
      executionId:    'exec-test',
      stepId:         'step-test',
      evidenceId:     id,
      mimeType:       'image/png',
    });
    expect(item.path).toBe(expected);
  });
});

// ─── Introspection ────────────────────────────────────────────────────────────

describe('EvidenceManager — introspection', () => {
  it('getQueue() returns all items in order', async () => {
    const { manager } = makeRig();
    const id1 = await manager.collect(makeRequest());
    const id2 = await manager.collect(makeRequest());
    const queue = manager.getQueue();
    expect(queue.map(i => i.evidenceId)).toContain(id1);
    expect(queue.map(i => i.evidenceId)).toContain(id2);
    expect(queue).toHaveLength(2);
  });

  it('pendingCount() / uploadedCount() / failedCount() reflect state correctly', async () => {
    const store = new InMemoryArtifactStore();
    const { manager } = makeRig(store);
    const id1 = await manager.collect(makeRequest());
    const id2 = await manager.collect(makeRequest());
    await manager.upload(id1); // success
    store.nextUploadError = new Error('x');
    await manager.upload(id2); // fail

    expect(manager.pendingCount()).toBe(0);
    expect(manager.uploadedCount()).toBe(1);
    expect(manager.failedCount()).toBe(1);
    expect(manager.totalCount()).toBe(2);
  });
});
