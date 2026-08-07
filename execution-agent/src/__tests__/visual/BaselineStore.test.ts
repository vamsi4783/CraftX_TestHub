// ─── BaselineStore Tests ──────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemoryBaselineStore }            from '../../visual/BaselineStore.js';
import { WHITE_10x10 }                      from './_pngFixtures.js';

describe('InMemoryBaselineStore', () => {
  let store: InMemoryBaselineStore;
  const KEY  = 'tc-1/step-1';
  const PNG  = WHITE_10x10();

  beforeEach(() => { store = new InMemoryBaselineStore(); });

  it('exists() returns false for unknown key', async () => {
    expect(await store.exists(KEY)).toBe(false);
  });

  it('save() then exists() returns true', async () => {
    await store.save(KEY, PNG);
    expect(await store.exists(KEY)).toBe(true);
  });

  it('load() returns the saved buffer', async () => {
    await store.save(KEY, PNG);
    const loaded = await store.load(KEY);
    expect(Buffer.compare(loaded, PNG)).toBe(0);
  });

  it('load() throws for unknown key', async () => {
    await expect(store.load('missing')).rejects.toThrow('Baseline not found');
  });

  it('delete() removes the key', async () => {
    await store.save(KEY, PNG);
    await store.delete(KEY);
    expect(await store.exists(KEY)).toBe(false);
  });

  it('delete() on non-existent key does not throw', async () => {
    await expect(store.delete('ghost')).resolves.toBeUndefined();
  });

  it('listKeys() returns all saved keys', async () => {
    await store.save('a/b', PNG);
    await store.save('a/c', PNG);
    const keys = await store.listKeys();
    expect(keys).toContain('a/b');
    expect(keys).toContain('a/c');
  });

  it('listKeys(prefix) filters by prefix', async () => {
    await store.save('tc-1/step-1', PNG);
    await store.save('tc-2/step-1', PNG);
    const keys = await store.listKeys('tc-1');
    expect(keys).toContain('tc-1/step-1');
    expect(keys).not.toContain('tc-2/step-1');
  });

  it('loadMeta() returns undefined for unknown key', async () => {
    expect(await store.loadMeta('missing')).toBeUndefined();
  });

  it('loadMeta() returns metadata after save with meta', async () => {
    await store.save(KEY, PNG, { driverKind: 'android', width: 10, height: 10 });
    const meta = await store.loadMeta(KEY);
    expect(meta?.driverKind).toBe('android');
    expect(meta?.key).toBe(KEY);
  });

  it('save() overwrites an existing baseline', async () => {
    const buf1 = WHITE_10x10();
    const buf2 = Buffer.alloc(50, 0x42);  // different content
    await store.save(KEY, buf1);
    await store.save(KEY, buf2);
    const loaded = await store.load(KEY);
    expect(Buffer.compare(loaded, buf2)).toBe(0);
  });
});
