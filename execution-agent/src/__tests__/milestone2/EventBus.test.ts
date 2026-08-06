// ─── Milestone 2: EventBus Tests ─────────────────────────────────────────────

import { EventBus,
         InvalidEnvelopeError,
         DuplicateEventError,
         UnregisteredEventTypeError } from '../../engine/EventBus.js';
import { EventRegistry,
         UnknownEventError }          from '../../events/EventRegistry.js';
import { EventStore }                 from '../../engine/EventStore.js';
import { InMemoryEventStoreAdapter }  from '../../engine/adapters/InMemoryEventStoreAdapter.js';
import { JsonEventDefinition }        from '../../events/EventDefinition.js';
import { validOk, validFailField }    from '../../events/ValidationResult.js';
import type { EventEnvelope }         from '../../events/envelope.js';
import type { ValidationResult }      from '../../events/ValidationResult.js';

// ─── Test definitions ─────────────────────────────────────────────────────────

class StepCompletedDef extends JsonEventDefinition<{ step_id: string }> {
  readonly event_type     = 'StepCompleted';
  readonly schema_version = 1;
  validate(payload: unknown): ValidationResult {
    const p = payload as Record<string, unknown>;
    if (typeof p?.['step_id'] !== 'string') return validFailField('step_id', 'Required string');
    return validOk();
  }
}

class ExecutionStartedDef extends JsonEventDefinition<{ session_id: string }> {
  readonly event_type     = 'ExecutionStarted';
  readonly schema_version = 1;
  validate(payload: unknown): ValidationResult {
    const p = payload as Record<string, unknown>;
    if (typeof p?.['session_id'] !== 'string') return validFailField('session_id', 'Required string');
    return validOk();
  }
}

class InvalidPayloadDef extends JsonEventDefinition<unknown> {
  readonly event_type     = 'AlwaysInvalid';
  readonly schema_version = 1;
  validate(_payload: unknown): ValidationResult {
    return validFailField('payload', 'Always fails');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _seq = 0;
function nextId(): string {
  _seq++;
  const hex = _seq.toString(16).padStart(12, '0');
  return `01926d2a-0000-7000-a000-${hex}`;
}

function makeEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    event_id:       nextId(),
    event_type:     'StepCompleted',
    schema_version: 1,
    causation_id:   nextId(),
    correlation_id: 'session-abc',
    org_id:         'org-xyz',
    agent_id:       'agent-001',
    occurred_at:    '2026-08-06T12:00:00Z',
    sequence:       _seq,
    payload:        { step_id: 'step-001' },
    ...overrides,
  };
}

function makeBus(): { bus: EventBus; registry: EventRegistry; adapter: InMemoryEventStoreAdapter } {
  const adapter  = new InMemoryEventStoreAdapter();
  const registry = new EventRegistry();
  const store    = new EventStore(adapter);
  const bus      = new EventBus(registry, store);
  return { bus, registry, adapter };
}

beforeEach(() => { _seq = 0; });

// ─── subscribe / unsubscribe ──────────────────────────────────────────────────

describe('EventBus.subscribe', () => {
  it('returns a unique SubscriptionId', () => {
    const { bus, registry } = makeBus();
    registry.register(new StepCompletedDef());
    const id1 = bus.subscribe('StepCompleted', async () => {});
    const id2 = bus.subscribe('StepCompleted', async () => {});
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('string');
  });

  it('throws UnregisteredEventTypeError for unregistered event_type', () => {
    const { bus } = makeBus();
    expect(() => bus.subscribe('GhostEvent', async () => {}))
      .toThrow(UnregisteredEventTypeError);
  });

  it('unsubscribe removes the handler (no delivery after removal)', async () => {
    const { bus, registry } = makeBus();
    registry.register(new StepCompletedDef());
    const received: string[] = [];
    const id = bus.subscribe('StepCompleted', () => { received.push('called'); });
    bus.unsubscribe(id);
    await bus.publish(makeEnvelope());
    expect(received).toHaveLength(0);
  });

  it('unsubscribe is a no-op for unknown id', () => {
    const { bus } = makeBus();
    expect(() => bus.unsubscribe('nonexistent-id')).not.toThrow();
  });
});

// ─── publish — success ────────────────────────────────────────────────────────

describe('EventBus.publish — success', () => {
  it('delivers to a single subscriber', async () => {
    const { bus, registry } = makeBus();
    registry.register(new StepCompletedDef());
    const received: EventEnvelope[] = [];
    bus.subscribe('StepCompleted', (env) => { received.push(env); });
    const env = makeEnvelope();
    await bus.publish(env);
    expect(received).toHaveLength(1);
    expect(received[0]?.event_id).toBe(env.event_id);
  });

  it('delivers to multiple subscribers for the same event_type', async () => {
    const { bus, registry } = makeBus();
    registry.register(new StepCompletedDef());
    const log: string[] = [];
    bus.subscribe('StepCompleted', () => { log.push('sub1'); });
    bus.subscribe('StepCompleted', () => { log.push('sub2'); });
    await bus.publish(makeEnvelope());
    expect(log).toEqual(['sub1', 'sub2']);
  });

  it('does not deliver to subscribers of other event_types', async () => {
    const { bus, registry } = makeBus();
    registry.register(new StepCompletedDef());
    registry.register(new ExecutionStartedDef());
    const log: string[] = [];
    bus.subscribe('ExecutionStarted', () => { log.push('wrong'); });
    await bus.publish(makeEnvelope({ event_type: 'StepCompleted', payload: { step_id: 's1' } }));
    expect(log).toHaveLength(0);
  });

  it('persists the event to the EventStore', async () => {
    const { bus, registry, adapter } = makeBus();
    registry.register(new StepCompletedDef());
    await bus.publish(makeEnvelope());
    expect(adapter.size()).toBe(1);
  });

  it('delivers events in publication order (deterministic ordering)', async () => {
    const { bus, registry } = makeBus();
    registry.register(new StepCompletedDef());
    const order: number[] = [];
    bus.subscribe('StepCompleted', (env) => { order.push((env as EventEnvelope<{step_id:string}>).sequence); });
    await bus.publish(makeEnvelope({ event_id: nextId(), sequence: 1, payload: { step_id: 's1' } }));
    await bus.publish(makeEnvelope({ event_id: nextId(), sequence: 2, payload: { step_id: 's2' } }));
    await bus.publish(makeEnvelope({ event_id: nextId(), sequence: 3, payload: { step_id: 's3' } }));
    expect(order).toEqual([1, 2, 3]);
  });
});

// ─── publish — rejection ──────────────────────────────────────────────────────

describe('EventBus.publish — rejection', () => {
  it('throws InvalidEnvelopeError for a structurally invalid envelope', async () => {
    const { bus, registry } = makeBus();
    registry.register(new StepCompletedDef());
    const bad = makeEnvelope({ event_id: 'not-a-uuid' });
    await expect(bus.publish(bad)).rejects.toThrow(InvalidEnvelopeError);
  });

  it('throws DuplicateEventError when the same event_id is published twice', async () => {
    const { bus, registry } = makeBus();
    registry.register(new StepCompletedDef());
    const env = makeEnvelope();
    await bus.publish(env);
    await expect(bus.publish(env)).rejects.toThrow(DuplicateEventError);
  });

  it('throws UnknownEventError for an event_type not in the registry', async () => {
    const { bus } = makeBus();
    // Do NOT register anything — no definitions
    const env = makeEnvelope({ event_type: 'GhostEvent', payload: {} });
    await expect(bus.publish(env)).rejects.toThrow(UnknownEventError);
  });

  it('throws EventValidationError for an invalid payload', async () => {
    const { bus, registry } = makeBus();
    registry.register(new InvalidPayloadDef());
    const env = makeEnvelope({ event_type: 'AlwaysInvalid', payload: {} });
    await expect(bus.publish(env)).rejects.toThrow();
  });

  it('does NOT store the event when envelope validation fails', async () => {
    const { bus, registry, adapter } = makeBus();
    registry.register(new StepCompletedDef());
    const bad = makeEnvelope({ event_id: 'not-a-uuid' });
    await expect(bus.publish(bad)).rejects.toThrow();
    expect(adapter.size()).toBe(0);
  });

  it('does NOT store the event when payload validation fails', async () => {
    const { bus, registry, adapter } = makeBus();
    registry.register(new InvalidPayloadDef());
    const env = makeEnvelope({ event_type: 'AlwaysInvalid', payload: {} });
    await expect(bus.publish(env)).rejects.toThrow();
    expect(adapter.size()).toBe(0);
  });
});

// ─── subscriber exception isolation ───────────────────────────────────────────

describe('EventBus — subscriber exception isolation', () => {
  it('a throwing subscriber does not prevent other subscribers from receiving', async () => {
    const { bus, registry } = makeBus();
    registry.register(new StepCompletedDef());
    const received: string[] = [];
    bus.subscribe('StepCompleted', async () => { throw new Error('bad sub'); });
    bus.subscribe('StepCompleted', () => { received.push('good'); });
    // publish() itself should not throw due to subscriber exception
    await expect(bus.publish(makeEnvelope())).resolves.not.toThrow();
    expect(received).toEqual(['good']);
  });

  it('publish resolves even when all subscribers throw', async () => {
    const { bus, registry } = makeBus();
    registry.register(new StepCompletedDef());
    bus.subscribe('StepCompleted', async () => { throw new Error('sub1'); });
    bus.subscribe('StepCompleted', async () => { throw new Error('sub2'); });
    await expect(bus.publish(makeEnvelope())).resolves.not.toThrow();
  });
});
