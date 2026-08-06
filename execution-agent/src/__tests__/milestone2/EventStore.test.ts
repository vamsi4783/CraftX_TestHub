// ─── Milestone 2: EventStore Tests ────────────────────────────────────────────

import { EventStore }                   from '../../engine/EventStore.js';
import { InMemoryEventStoreAdapter }    from '../../engine/adapters/InMemoryEventStoreAdapter.js';
import { EventStoreImmutabilityError }  from '../../engine/IEventStoreAdapter.js';
import type { EventEnvelope }           from '../../events/envelope.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    event_id:       '01926d2a-1f3b-7000-a000-000000000001',
    event_type:     'StepCompleted',
    schema_version: 1,
    causation_id:   '01926d2a-1f3b-7000-a000-000000000000',
    correlation_id: 'session-abc',
    org_id:         'org-xyz',
    agent_id:       'agent-001',
    occurred_at:    '2026-08-06T12:00:00Z',
    sequence:       1,
    payload:        { step_id: 'step-001' },
    ...overrides,
  };
}

function makeStore(): { store: EventStore; adapter: InMemoryEventStoreAdapter } {
  const adapter = new InMemoryEventStoreAdapter();
  const store   = new EventStore(adapter);
  return { store, adapter };
}

const SERIALIZED = (env: EventEnvelope): string => JSON.stringify(env);

// ─── append / load ────────────────────────────────────────────────────────────

describe('EventStore.append / load', () => {
  it('stores and retrieves an event by event_id', async () => {
    const { store } = makeStore();
    const env = makeEnvelope();
    await store.append(env, SERIALIZED(env));
    const retrieved = await store.load(env.event_id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.event_id).toBe(env.event_id);
    expect(retrieved?.event_type).toBe('StepCompleted');
  });

  it('returns null for an unknown event_id', async () => {
    const { store } = makeStore();
    expect(await store.load('nonexistent-id')).toBeNull();
  });

  it('preserves all envelope fields through round-trip', async () => {
    const { store } = makeStore();
    const env = makeEnvelope({ payload: { step_id: 'step-007', duration_ms: 123 } });
    await store.append(env, SERIALIZED(env));
    const r = await store.load(env.event_id);
    expect(r?.event_type).toBe(env.event_type);
    expect(r?.schema_version).toBe(env.schema_version);
    expect(r?.correlation_id).toBe(env.correlation_id);
    expect(r?.org_id).toBe(env.org_id);
    expect(r?.agent_id).toBe(env.agent_id);
    expect(r?.sequence).toBe(env.sequence);
    expect((r?.payload as Record<string, unknown>)?.['step_id']).toBe('step-007');
  });

  it('throws EventStoreImmutabilityError on duplicate event_id', async () => {
    const { store } = makeStore();
    const env = makeEnvelope();
    await store.append(env, SERIALIZED(env));
    await expect(store.append(env, SERIALIZED(env)))
      .rejects.toThrow(EventStoreImmutabilityError);
  });

  it('adapter is never mutated after append (row is a copy)', async () => {
    const { store, adapter } = makeStore();
    const env = makeEnvelope();
    await store.append(env, SERIALIZED(env));
    const rows = adapter.all();
    expect(rows).toHaveLength(1);
    // Mutating the returned row should not affect the stored copy
    rows[0]!.event_type = 'MUTATED';
    const again = await store.load(env.event_id);
    expect(again?.event_type).toBe('StepCompleted');
  });
});

// ─── appendBatch ──────────────────────────────────────────────────────────────

describe('EventStore.appendBatch', () => {
  it('stores all events in a batch', async () => {
    const { store, adapter } = makeStore();
    const envA = makeEnvelope({ event_id: '01926d2a-0000-7000-a000-000000000001', sequence: 1 });
    const envB = makeEnvelope({ event_id: '01926d2a-0000-7000-a000-000000000002', sequence: 2 });
    await store.appendBatch([
      { envelope: envA, serialized: SERIALIZED(envA) },
      { envelope: envB, serialized: SERIALIZED(envB) },
    ]);
    expect(adapter.size()).toBe(2);
    expect(await store.load(envA.event_id)).not.toBeNull();
    expect(await store.load(envB.event_id)).not.toBeNull();
  });

  it('no-ops on an empty batch', async () => {
    const { store, adapter } = makeStore();
    await expect(store.appendBatch([])).resolves.not.toThrow();
    expect(adapter.size()).toBe(0);
  });

  it('throws on duplicate within the batch — atomic (none stored)', async () => {
    const { store, adapter } = makeStore();
    const env = makeEnvelope();
    await expect(
      store.appendBatch([
        { envelope: env, serialized: SERIALIZED(env) },
        { envelope: env, serialized: SERIALIZED(env) }, // duplicate
      ]),
    ).rejects.toThrow(EventStoreImmutabilityError);
    // Atomic: nothing stored
    expect(adapter.size()).toBe(0);
  });

  it('throws when batch contains an event_id already in the store', async () => {
    const { store } = makeStore();
    const env = makeEnvelope();
    await store.append(env, SERIALIZED(env));
    await expect(
      store.appendBatch([{ envelope: env, serialized: SERIALIZED(env) }]),
    ).rejects.toThrow(EventStoreImmutabilityError);
  });
});

// ─── loadByCorrelation / loadByExecution ─────────────────────────────────────

describe('EventStore.loadByCorrelation / loadByExecution', () => {
  async function storeSession(store: EventStore, session_id: string): Promise<EventEnvelope[]> {
    const evs = [
      makeEnvelope({ event_id: '01000000-0000-7000-a000-000000000001', correlation_id: session_id, sequence: 1 }),
      makeEnvelope({ event_id: '01000000-0000-7000-a000-000000000002', correlation_id: session_id, sequence: 2 }),
      makeEnvelope({ event_id: '01000000-0000-7000-a000-000000000003', correlation_id: session_id, sequence: 3 }),
    ];
    for (const ev of evs) await store.append(ev, SERIALIZED(ev));
    return evs;
  }

  it('returns events for a correlation_id in sequence order', async () => {
    const { store } = makeStore();
    await storeSession(store, 'session-abc');
    const results = await store.loadByCorrelation('session-abc');
    expect(results).toHaveLength(3);
    expect(results.map(r => r.sequence)).toEqual([1, 2, 3]);
  });

  it('returns empty array for unknown correlation_id', async () => {
    const { store } = makeStore();
    expect(await store.loadByCorrelation('ghost-session')).toEqual([]);
  });

  it('does not return events from a different correlation_id', async () => {
    const { store } = makeStore();
    await storeSession(store, 'session-A');
    const other = makeEnvelope({
      event_id: '02000000-0000-7000-a000-000000000001',
      correlation_id: 'session-B',
      sequence: 1,
    });
    await store.append(other, SERIALIZED(other));
    const resultsA = await store.loadByCorrelation('session-A');
    expect(resultsA.every(r => r.correlation_id === 'session-A')).toBe(true);
    expect(resultsA).toHaveLength(3);
  });

  it('loadByExecution returns the same events as loadByCorrelation', async () => {
    const { store } = makeStore();
    await storeSession(store, 'session-abc');
    const byCorr = await store.loadByCorrelation('session-abc');
    const byExec = await store.loadByExecution('session-abc');
    expect(byExec.map(r => r.event_id)).toEqual(byCorr.map(r => r.event_id));
  });
});
