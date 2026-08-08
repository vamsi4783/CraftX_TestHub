import { describe, it, expect, beforeEach } from 'vitest';
import { SecureCredentialStoreImpl } from '../../features/ai-connectors/secureCredentialStore';

// Clear sessionStorage before each test so constructor restore doesn't bleed between tests
beforeEach(() => {
  sessionStorage.clear();
});

// Use a fresh instance per test — isolates sessionStorage behaviour
function makeStore() {
  return new SecureCredentialStoreImpl();
}

describe('SecureCredentialStore — store / retrieve', () => {
  it('stored secret is retrievable as SecureString', () => {
    const store = makeStore();
    store.store('gemini', 'AIza-test-key');
    const s = store.retrieve('gemini');
    expect(s).not.toBeUndefined();
    expect(s!.reveal()).toBe('AIza-test-key');
  });

  it('returns undefined for unknown connector', () => {
    const store = makeStore();
    expect(store.retrieve('nobody')).toBeUndefined();
  });

  it('hasSecret returns true after storing', () => {
    const store = makeStore();
    store.store('x', 'my-key');
    expect(store.hasSecret('x')).toBe(true);
  });

  it('hasSecret returns false before storing', () => {
    const store = makeStore();
    expect(store.hasSecret('x')).toBe(false);
  });
});

describe('SecureCredentialStore — security: keys are redacted', () => {
  it('toString() of SecureString returns [REDACTED]', () => {
    const store = makeStore();
    store.store('gemini', 'AIza-secret');
    const s = store.retrieve('gemini')!;
    expect(s.toString()).toBe('[REDACTED]');
  });

  it('toJSON() of SecureString returns [REDACTED]', () => {
    const store = makeStore();
    store.store('gemini', 'AIza-secret');
    const s = store.retrieve('gemini')!;
    expect(s.toJSON()).toBe('[REDACTED]');
  });

  it('JSON.stringify of SecureString does not expose key', () => {
    const store = makeStore();
    store.store('gemini', 'AIza-super-secret');
    const s = store.retrieve('gemini')!;
    const serialized = JSON.stringify({ key: s });
    expect(serialized).not.toContain('super-secret');
    expect(serialized).toContain('[REDACTED]');
  });

  it('raw key does not appear when store object is serialized', () => {
    const store = makeStore();
    store.store('gemini', 'AIza-should-not-leak');
    // Simulating accidental logging of the store
    const logged = JSON.stringify(store);
    expect(logged).not.toContain('should-not-leak');
  });
});

describe('SecureCredentialStore — clear', () => {
  it('clear(id) removes the secret', () => {
    const store = makeStore();
    store.store('x', 'key');
    store.clear('x');
    expect(store.retrieve('x')).toBeUndefined();
    expect(store.hasSecret('x')).toBe(false);
  });

  it('clearAll() removes all secrets', () => {
    const store = makeStore();
    store.store('a', 'key-a');
    store.store('b', 'key-b');
    store.clearAll();
    expect(store.hasSecret('a')).toBe(false);
    expect(store.hasSecret('b')).toBe(false);
  });

  it('clearing non-existent key does not throw', () => {
    const store = makeStore();
    expect(() => store.clear('ghost')).not.toThrow();
  });
});

describe('SecureCredentialStore — empty key is ignored', () => {
  it('does not store empty string', () => {
    const store = makeStore();
    store.store('gemini', '');
    expect(store.hasSecret('gemini')).toBe(false);
  });
});
