// ─── Milestone 2: EventRegistry Tests ────────────────────────────────────────

import { EventRegistry,
         DuplicateEventDefinitionError,
         UnknownEventError } from '../../events/EventRegistry.js';
import { JsonEventDefinition } from '../../events/EventDefinition.js';
import { validOk, validFailField } from '../../events/ValidationResult.js';
import type { EventEnvelope } from '../../events/envelope.js';
import type { ValidationResult } from '../../events/ValidationResult.js';

// ─── Test definitions ─────────────────────────────────────────────────────────

class StepCompletedDef extends JsonEventDefinition<{ step_id: string }> {
  readonly event_type     = 'StepCompleted';
  readonly schema_version = 1;
  validate(payload: unknown): ValidationResult {
    const p = payload as Record<string, unknown>;
    if (typeof p?.['step_id'] !== 'string') {
      return validFailField('step_id', 'Required string');
    }
    return validOk();
  }
}

class StepCompletedV2Def extends JsonEventDefinition<{ step_id: string; duration_ms: number }> {
  readonly event_type     = 'StepCompleted';
  readonly schema_version = 2;
  validate(payload: unknown): ValidationResult {
    const p = payload as Record<string, unknown>;
    if (typeof p?.['step_id'] !== 'string') return validFailField('step_id', 'Required string');
    if (typeof p?.['duration_ms'] !== 'number') return validFailField('duration_ms', 'Required number');
    return validOk();
  }
}

class AlwaysInvalidDef extends JsonEventDefinition<unknown> {
  readonly event_type     = 'AlwaysInvalid';
  readonly schema_version = 1;
  validate(_payload: unknown): ValidationResult {
    return validFailField('payload', 'Always fails');
  }
}

function makeEnvelope(
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope {
  return {
    event_id:       '01926d2a-1f3b-7c4e-a5b6-c7d8e9f01234',
    event_type:     'StepCompleted',
    schema_version: 1,
    causation_id:   '01926d2a-1f3b-7c4e-a5b6-c7d8e9f01234',
    correlation_id: 'session-abc',
    org_id:         'org-xyz',
    agent_id:       'agent-001',
    occurred_at:    '2026-08-06T12:00:00Z',
    sequence:       1,
    payload:        { step_id: 'step-001' },
    ...overrides,
  };
}

// ─── register() ──────────────────────────────────────────────────────────────

describe('EventRegistry.register', () => {
  it('registers a new definition without error', () => {
    const reg = new EventRegistry();
    expect(() => reg.register(new StepCompletedDef())).not.toThrow();
  });

  it('allows multiple definitions for different event_types', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    reg.register(new AlwaysInvalidDef());
    expect(reg.registeredTypes()).toHaveLength(2);
  });

  it('allows multiple versions of the same event_type', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    reg.register(new StepCompletedV2Def());
    expect(reg.registeredTypes()).toHaveLength(2);
  });

  it('throws DuplicateEventDefinitionError on exact duplicate', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    expect(() => reg.register(new StepCompletedDef()))
      .toThrow(DuplicateEventDefinitionError);
  });

  it('DuplicateEventDefinitionError message mentions the type and version', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    try {
      reg.register(new StepCompletedDef());
    } catch (err) {
      expect(String(err)).toContain('StepCompleted');
      expect(String(err)).toContain('v1');
    }
  });
});

// ─── resolve() ───────────────────────────────────────────────────────────────

describe('EventRegistry.resolve', () => {
  it('returns the definition for a registered type', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    const def = reg.resolve('StepCompleted', 1);
    expect(def.event_type).toBe('StepCompleted');
    expect(def.schema_version).toBe(1);
  });

  it('routes to the correct version', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    reg.register(new StepCompletedV2Def());
    expect(reg.resolve('StepCompleted', 1).schema_version).toBe(1);
    expect(reg.resolve('StepCompleted', 2).schema_version).toBe(2);
  });

  it('throws UnknownEventError for an unregistered type', () => {
    const reg = new EventRegistry();
    expect(() => reg.resolve('GhostEvent', 1)).toThrow(UnknownEventError);
  });

  it('throws UnknownEventError for a registered type with a wrong version', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    expect(() => reg.resolve('StepCompleted', 99)).toThrow(UnknownEventError);
  });
});

// ─── validatePayload() ────────────────────────────────────────────────────────

describe('EventRegistry.validatePayload', () => {
  it('returns ok for a valid payload', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    const result = reg.validatePayload(makeEnvelope({ payload: { step_id: 'step-001' } }));
    expect(result.ok).toBe(true);
  });

  it('returns failure for an invalid payload', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    const result = reg.validatePayload(makeEnvelope({ payload: { wrong: true } }));
    expect(result.ok).toBe(false);
  });

  it('routes by schema_version — v1 validates with v1 rules', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    reg.register(new StepCompletedV2Def());
    // v2 requires duration_ms; v1 does not
    const v1Result = reg.validatePayload(makeEnvelope({
      schema_version: 1,
      payload: { step_id: 's1' },
    }));
    expect(v1Result.ok).toBe(true);

    const v2Missing = reg.validatePayload(makeEnvelope({
      schema_version: 2,
      payload: { step_id: 's1' }, // missing duration_ms
    }));
    expect(v2Missing.ok).toBe(false);
  });

  it('throws UnknownEventError for an unregistered type', () => {
    const reg = new EventRegistry();
    expect(() => reg.validatePayload(makeEnvelope({ event_type: 'Unknown', schema_version: 1 })))
      .toThrow(UnknownEventError);
  });
});

// ─── serialize / deserialize ──────────────────────────────────────────────────

describe('EventRegistry serialize / deserialize', () => {
  it('serialize produces a JSON string', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    const env = makeEnvelope();
    const raw = reg.serialize(env);
    expect(typeof raw).toBe('string');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('deserialize round-trips correctly', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    const env = makeEnvelope();
    const raw    = reg.serialize(env);
    const result = reg.deserialize('StepCompleted', 1, raw);
    expect(result.event_id).toBe(env.event_id);
    expect(result.event_type).toBe('StepCompleted');
    expect((result.payload as { step_id: string }).step_id).toBe('step-001');
  });

  it('serialize throws UnknownEventError for unregistered type', () => {
    const reg = new EventRegistry();
    expect(() => reg.serialize(makeEnvelope({ event_type: 'Ghost', schema_version: 1 })))
      .toThrow(UnknownEventError);
  });
});

// ─── isRegistered / isTypeRegistered / registeredTypes ───────────────────────

describe('EventRegistry introspection', () => {
  it('isRegistered returns true for exact pair', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    expect(reg.isRegistered('StepCompleted', 1)).toBe(true);
    expect(reg.isRegistered('StepCompleted', 2)).toBe(false);
  });

  it('isTypeRegistered returns true when any version is registered', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    expect(reg.isTypeRegistered('StepCompleted')).toBe(true);
    expect(reg.isTypeRegistered('UnknownType')).toBe(false);
  });

  it('registeredTypes returns correct list', () => {
    const reg = new EventRegistry();
    reg.register(new StepCompletedDef());
    reg.register(new StepCompletedV2Def());
    const types = reg.registeredTypes();
    expect(types).toHaveLength(2);
    expect(types.some(t => t.event_type === 'StepCompleted' && t.schema_version === 1)).toBe(true);
    expect(types.some(t => t.event_type === 'StepCompleted' && t.schema_version === 2)).toBe(true);
  });
});
