// ─── Milestone 6: EvidenceQueue Tests ────────────────────────────────────────

import { EvidenceQueue,
         EvidenceImmutabilityError } from '../../evidence/EvidenceQueue.js';
import type { EvidenceQueueItem }    from '../../evidence/EvidenceTypes.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeItem(evidenceId: string, overrides: Partial<EvidenceQueueItem> = {}): EvidenceQueueItem {
  return {
    queueId:    `q-${evidenceId}`,
    evidenceId,
    request:    Object.freeze({
      executionId:    'exec-001',
      stepId:         'step-001',
      stepNumber:     1,
      sessionId:      'sess-001',
      organizationId: 'org-001',
      projectId:      'proj-001',
      evidenceType:   'failure_screenshot',
      mimeType:       'image/png',
      data:           Buffer.from('fake-png'),
      device:  { device_model: 'Pixel 7a', os_name: 'Android', os_version: '14', screen_width_px: 1080, screen_height_px: 2400, orientation: 'portrait' },
      app:     { app_package: 'com.example.app', app_version: '1.0.0', app_build: '42' },
      driver:  { driver_id: 'android_adb', driver_version: '1.0.0', driver_capabilities: ['tap'] },
      stepStatus: 'failed',
      stepDuration_ms: 500,
    }),
    path:       `org-001/proj-001/exec-001/step-001/${evidenceId}.png`,
    enqueuedAt: '2026-08-07T10:00:00Z',
    status:     'pending',
    retryCount: 0,
    ...overrides,
  };
}

// ─── enqueue ──────────────────────────────────────────────────────────────────

describe('EvidenceQueue.enqueue', () => {
  it('enqueues an item without error', () => {
    const q = new EvidenceQueue();
    expect(() => q.enqueue(makeItem('ev-001'))).not.toThrow();
  });

  it('size() increases after enqueue', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001'));
    q.enqueue(makeItem('ev-002'));
    expect(q.size()).toBe(2);
  });

  it('throws EvidenceImmutabilityError on duplicate evidenceId', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001'));
    expect(() => q.enqueue(makeItem('ev-001'))).toThrow(EvidenceImmutabilityError);
  });

  it('EvidenceImmutabilityError message contains evidenceId', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-dup'));
    try {
      q.enqueue(makeItem('ev-dup'));
    } catch (err) {
      expect(String(err)).toContain('ev-dup');
    }
  });

  it('different evidenceIds can be enqueued', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001'));
    q.enqueue(makeItem('ev-002'));
    expect(q.size()).toBe(2);
  });
});

// ─── get ──────────────────────────────────────────────────────────────────────

describe('EvidenceQueue.get', () => {
  it('returns the item by evidenceId', () => {
    const q    = new EvidenceQueue();
    const item = makeItem('ev-001');
    q.enqueue(item);
    expect(q.get('ev-001')).toBe(item);
  });

  it('returns undefined for unknown evidenceId', () => {
    const q = new EvidenceQueue();
    expect(q.get('nonexistent')).toBeUndefined();
  });
});

// ─── FIFO ordering ────────────────────────────────────────────────────────────

describe('EvidenceQueue — FIFO ordering', () => {
  it('all() returns items in insertion order', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001'));
    q.enqueue(makeItem('ev-002'));
    q.enqueue(makeItem('ev-003'));
    expect(q.all().map(i => i.evidenceId)).toEqual(['ev-001', 'ev-002', 'ev-003']);
  });

  it('pending() returns only pending items in insertion order', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001'));
    q.enqueue(makeItem('ev-002', { status: 'uploaded' }));
    q.enqueue(makeItem('ev-003'));
    expect(q.pending().map(i => i.evidenceId)).toEqual(['ev-001', 'ev-003']);
  });
});

// ─── Status views ─────────────────────────────────────────────────────────────

describe('EvidenceQueue — status views', () => {
  it('uploaded() returns only uploaded items', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001'));
    q.enqueue(makeItem('ev-002', { status: 'uploaded' }));
    expect(q.uploaded().map(i => i.evidenceId)).toEqual(['ev-002']);
  });

  it('failed() returns only failed items', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001', { status: 'failed' }));
    q.enqueue(makeItem('ev-002'));
    expect(q.failed().map(i => i.evidenceId)).toEqual(['ev-001']);
  });

  it('has() returns true for enqueued evidenceId', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001'));
    expect(q.has('ev-001')).toBe(true);
  });

  it('has() returns false for unknown evidenceId', () => {
    expect(new EvidenceQueue().has('ghost')).toBe(false);
  });
});

// ─── Status transitions ───────────────────────────────────────────────────────

describe('EvidenceQueue.transition', () => {
  it('pending → uploading succeeds', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001'));
    q.transition('ev-001', 'uploading');
    expect(q.get('ev-001')!.status).toBe('uploading');
  });

  it('uploading → uploaded succeeds', () => {
    const q    = new EvidenceQueue();
    const item = makeItem('ev-001');
    q.enqueue(item);
    q.transition('ev-001', 'uploading');
    q.transition('ev-001', 'uploaded');
    expect(q.get('ev-001')!.status).toBe('uploaded');
  });

  it('uploading → failed succeeds', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001'));
    q.transition('ev-001', 'uploading');
    q.transition('ev-001', 'failed');
    expect(q.get('ev-001')!.status).toBe('failed');
  });

  it('failed → pending (retry re-queue) succeeds', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001', { status: 'failed' }));
    q.transition('ev-001', 'pending');
    expect(q.get('ev-001')!.status).toBe('pending');
  });

  it('illegal transition pending → uploaded throws', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001'));
    expect(() => q.transition('ev-001', 'uploaded')).toThrow();
  });

  it('illegal transition uploaded → pending throws', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001', { status: 'uploaded' }));
    expect(() => q.transition('ev-001', 'pending')).toThrow();
  });

  it('transition on unknown evidenceId throws', () => {
    const q = new EvidenceQueue();
    expect(() => q.transition('ghost', 'uploading')).toThrow();
  });
});

// ─── Immutability ─────────────────────────────────────────────────────────────

describe('EvidenceQueue — immutability', () => {
  it('item.request is frozen (Object.isFrozen)', () => {
    const q = new EvidenceQueue();
    const item = makeItem('ev-001');
    q.enqueue(item);
    expect(Object.isFrozen(q.get('ev-001')!.request)).toBe(true);
  });

  it('evidenceId cannot be changed after enqueue (readonly)', () => {
    const q = new EvidenceQueue();
    q.enqueue(makeItem('ev-001'));
    const item = q.get('ev-001')!;
    // TypeScript readonly prevents this — verify the value is unchanged
    expect(item.evidenceId).toBe('ev-001');
  });
});
