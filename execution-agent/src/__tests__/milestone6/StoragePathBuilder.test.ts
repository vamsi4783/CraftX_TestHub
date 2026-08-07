// ─── Milestone 6: StoragePathBuilder Tests ───────────────────────────────────

import {
  buildStoragePath,
  mimeTypeToExtension,
}                        from '../../evidence/StoragePathBuilder.js';
import type { StoragePathParams } from '../../evidence/StoragePathBuilder.js';

function baseParams(overrides: Partial<StoragePathParams> = {}): StoragePathParams {
  return {
    organizationId: 'org-abc',
    projectId:      'proj-xyz',
    executionId:    'exec-01j9z0000001',
    stepId:         'step-001',
    evidenceId:     'ev-01j9z0000002',
    mimeType:       'image/png',
    ...overrides,
  };
}

// ─── Path format ──────────────────────────────────────────────────────────────

describe('buildStoragePath — path format', () => {
  it('produces org/project/execution/step/evidenceId.ext', () => {
    const path = buildStoragePath(baseParams());
    const parts = path.split('/');
    expect(parts).toHaveLength(5);
  });

  it('first segment is organizationId', () => {
    const path = buildStoragePath(baseParams({ organizationId: 'org-test' }));
    expect(path.split('/')[0]).toBe('org-test');
  });

  it('second segment is projectId', () => {
    const path = buildStoragePath(baseParams({ projectId: 'proj-test' }));
    expect(path.split('/')[1]).toBe('proj-test');
  });

  it('third segment is executionId', () => {
    const path = buildStoragePath(baseParams({ executionId: 'exec-foo' }));
    expect(path.split('/')[2]).toBe('exec-foo');
  });

  it('fourth segment is stepId', () => {
    const path = buildStoragePath(baseParams({ stepId: 'step-bar' }));
    expect(path.split('/')[3]).toBe('step-bar');
  });

  it('fifth segment is evidenceId with extension', () => {
    const path = buildStoragePath(baseParams({ evidenceId: 'ev-123', mimeType: 'image/png' }));
    expect(path.split('/')[4]).toBe('ev-123.png');
  });
});

// ─── No timestamps ────────────────────────────────────────────────────────────

describe('buildStoragePath — no timestamps', () => {
  it('path does not contain ISO date patterns', () => {
    const path = buildStoragePath(baseParams());
    // No YYYY-MM-DD or timestamp-like patterns
    expect(path).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('path does not contain unix timestamps', () => {
    const path = buildStoragePath(baseParams());
    // No 10-13 digit numeric sequences (unix timestamp / ms)
    expect(path).not.toMatch(/\b\d{10,13}\b/);
  });

  it('result is deterministic — same inputs always produce same path', () => {
    const p1 = buildStoragePath(baseParams());
    const p2 = buildStoragePath(baseParams());
    expect(p1).toBe(p2);
  });
});

// ─── Sanitisation ─────────────────────────────────────────────────────────────

describe('buildStoragePath — sanitisation', () => {
  it('lowercases all segments', () => {
    const path = buildStoragePath(baseParams({
      organizationId: 'ORG-UPPER',
      projectId:      'Proj-Mixed',
    }));
    expect(path).not.toMatch(/[A-Z]/);
  });

  it('replaces spaces with underscores', () => {
    const path = buildStoragePath(baseParams({ organizationId: 'org name' }));
    expect(path.split('/')[0]).toBe('org_name');
  });

  it('preserves hyphens (UUIDs)', () => {
    const uuid = '01923abc-def0-7000-a000-000000000001';
    const path = buildStoragePath(baseParams({ evidenceId: uuid }));
    expect(path).toContain(uuid);
  });
});

// ─── MIME type → extension ────────────────────────────────────────────────────

describe('mimeTypeToExtension', () => {
  const cases: [string, string][] = [
    ['image/png',        'png'],
    ['image/jpeg',       'jpg'],
    ['image/webp',       'webp'],
    ['text/plain',       'txt'],
    ['text/html',        'html'],
    ['application/xml',  'xml'],
    ['text/xml',         'xml'],
    ['application/json', 'json'],
    ['video/mp4',        'mp4'],
    ['video/webm',       'webm'],
  ];

  it.each(cases)('%s → %s', (mimeType, expected) => {
    expect(mimeTypeToExtension(mimeType)).toBe(expected);
  });

  it('falls back to "bin" for unknown MIME type', () => {
    expect(mimeTypeToExtension('application/octet-stream')).toBe('bin');
  });

  it('is case-insensitive', () => {
    expect(mimeTypeToExtension('IMAGE/PNG')).toBe('png');
  });

  it('trims whitespace', () => {
    expect(mimeTypeToExtension('  image/png  ')).toBe('png');
  });
});

// ─── Extension in path ────────────────────────────────────────────────────────

describe('buildStoragePath — extension from MIME', () => {
  it('png for image/png', () => {
    const path = buildStoragePath(baseParams({ mimeType: 'image/png' }));
    expect(path).toMatch(/\.png$/);
  });

  it('txt for text/plain', () => {
    const path = buildStoragePath(baseParams({ mimeType: 'text/plain' }));
    expect(path).toMatch(/\.txt$/);
  });

  it('xml for application/xml', () => {
    const path = buildStoragePath(baseParams({ mimeType: 'application/xml' }));
    expect(path).toMatch(/\.xml$/);
  });

  it('bin for unknown mime', () => {
    const path = buildStoragePath(baseParams({ mimeType: 'application/weird' }));
    expect(path).toMatch(/\.bin$/);
  });
});
