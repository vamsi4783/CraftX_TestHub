import { describe, it, expect, beforeEach } from 'vitest';
import { aiConnectorStore, type PersistedConnector } from '../../features/ai-connectors/aiConnectorStore';

import type { ConnectorKind } from '../../features/ai-connectors/aiConnectorStore';
function makeRecord(id = 'gemini', kind: ConnectorKind = 'gemini'): PersistedConnector {
  const now = new Date().toISOString();
  return {
    id, kind,
    displayName: 'Gemini Flash',
    enabled:     true,
    priority:    10,
    model:       'gemini-2.0-flash',
    createdAt:   now,
    updatedAt:   now,
  };
}

beforeEach(() => {
  aiConnectorStore._reset();
});

describe('aiConnectorStore — list / add', () => {
  it('starts empty', () => {
    expect(aiConnectorStore.list()).toHaveLength(0);
  });

  it('add() stores and list() returns it', () => {
    aiConnectorStore.add(makeRecord());
    expect(aiConnectorStore.list()).toHaveLength(1);
    expect(aiConnectorStore.list()[0].id).toBe('gemini');
  });

  it('add() throws for duplicate id', () => {
    aiConnectorStore.add(makeRecord());
    expect(() => aiConnectorStore.add(makeRecord())).toThrow();
  });

  it('get() returns the record', () => {
    aiConnectorStore.add(makeRecord());
    expect(aiConnectorStore.get('gemini')?.displayName).toBe('Gemini Flash');
  });

  it('get() returns undefined for unknown id', () => {
    expect(aiConnectorStore.get('nobody')).toBeUndefined();
  });
});

describe('aiConnectorStore — update', () => {
  it('update() modifies fields', () => {
    aiConnectorStore.add(makeRecord());
    aiConnectorStore.update('gemini', { displayName: 'My Gemini', enabled: false });
    expect(aiConnectorStore.get('gemini')?.displayName).toBe('My Gemini');
    expect(aiConnectorStore.get('gemini')?.enabled).toBe(false);
  });

  it('update() updates updatedAt', () => {
    const before = new Date().toISOString();
    aiConnectorStore.add(makeRecord());
    aiConnectorStore.update('gemini', { priority: 5 });
    expect(aiConnectorStore.get('gemini')!.updatedAt >= before).toBe(true);
  });

  it('update() returns false for unknown id', () => {
    expect(aiConnectorStore.update('nobody', { displayName: 'x' })).toBe(false);
  });

  it('update() cannot change id or kind', () => {
    aiConnectorStore.add(makeRecord());
    // @ts-expect-error — kind is readonly in type, but testing JS runtime
    aiConnectorStore.update('gemini', { id: 'changed', kind: 'ollama' });
    // id unchanged
    expect(aiConnectorStore.get('gemini')?.id).toBe('gemini');
  });
});

describe('aiConnectorStore — remove', () => {
  it('remove() deletes the record', () => {
    aiConnectorStore.add(makeRecord());
    aiConnectorStore.remove('gemini');
    expect(aiConnectorStore.list()).toHaveLength(0);
  });

  it('remove() returns false for unknown id', () => {
    expect(aiConnectorStore.remove('nobody')).toBe(false);
  });

  it('remove() clears default if deleted connector was default', () => {
    aiConnectorStore.add(makeRecord());
    aiConnectorStore.setDefault('gemini');
    aiConnectorStore.remove('gemini');
    expect(aiConnectorStore.getDefault()).toBeUndefined();
  });
});

describe('aiConnectorStore — default connector', () => {
  it('getDefault() returns undefined before set', () => {
    expect(aiConnectorStore.getDefault()).toBeUndefined();
  });

  it('setDefault() persists', () => {
    aiConnectorStore.setDefault('gemini');
    expect(aiConnectorStore.getDefault()).toBe('gemini');
  });

  it('clearDefault() removes it', () => {
    aiConnectorStore.setDefault('gemini');
    aiConnectorStore.clearDefault();
    expect(aiConnectorStore.getDefault()).toBeUndefined();
  });

  it('setDefault(undefined) removes it', () => {
    aiConnectorStore.setDefault('gemini');
    aiConnectorStore.setDefault(undefined);
    expect(aiConnectorStore.getDefault()).toBeUndefined();
  });
});

describe('aiConnectorStore — persistence across reads', () => {
  it('data survives multiple list() calls', () => {
    aiConnectorStore.add(makeRecord());
    aiConnectorStore.add(makeRecord('ollama', 'ollama'));
    expect(aiConnectorStore.list()).toHaveLength(2);
    expect(aiConnectorStore.list()).toHaveLength(2); // second read
  });

  it('secrets are never in the stored data', () => {
    const record = makeRecord();
    aiConnectorStore.add(record);
    const stored = localStorage.getItem('testhub:ai_connectors:v1')!;
    // No field contains anything that looks like a key
    expect(stored).not.toContain('apiKey');
    expect(stored).not.toContain('secret');
    expect(stored).not.toContain('password');
  });
});
