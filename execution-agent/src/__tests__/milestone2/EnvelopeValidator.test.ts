// ─── Milestone 2: EnvelopeValidator Tests ─────────────────────────────────────

import { EnvelopeValidator } from '../../events/EnvelopeValidator.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const VALID_UUID = '01926d2a-1f3b-7c4e-a5b6-c7d8e9f01234';
const VALID_TS   = '2026-08-06T12:00:00.000Z';

function validEvent(): Record<string, unknown> {
  return {
    event_id:       VALID_UUID,
    event_type:     'StepCompleted',
    schema_version: 1,
    causation_id:   VALID_UUID,
    correlation_id: 'session-abc',
    org_id:         'org-xyz',
    agent_id:       'execution-agent/android',
    occurred_at:    VALID_TS,
    sequence:       1,
    payload:        { step_id: 's1' },
  };
}

function validCommand(): Record<string, unknown> {
  return {
    command_id:     '550e8400-e29b-41d4-a716-446655440000',
    command_type:   'RunSession',
    correlation_id: 'session-abc',
    org_id:         'org-xyz',
    issued_at:      VALID_TS,
    payload:        { session_id: 'session-abc' },
  };
}

// ─── EventEnvelope validation ────────────────────────────────────────────────

describe('EnvelopeValidator.validateEvent', () => {
  it('returns ok for a valid envelope', () => {
    expect(EnvelopeValidator.validateEvent(validEvent())).toEqual({ ok: true });
  });

  it('rejects null', () => {
    const r = EnvelopeValidator.validateEvent(null);
    expect(r.ok).toBe(false);
  });

  it('rejects a non-object', () => {
    const r = EnvelopeValidator.validateEvent('string');
    expect(r.ok).toBe(false);
  });

  it('rejects missing event_id', () => {
    const e = validEvent();
    delete e['event_id'];
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'event_id')).toBe(true);
  });

  it('rejects malformed UUID for event_id', () => {
    const e = validEvent();
    e['event_id'] = 'not-a-uuid';
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'event_id')).toBe(true);
  });

  it('rejects event_type that does not start with uppercase', () => {
    const e = validEvent();
    e['event_type'] = 'stepCompleted';
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'event_type')).toBe(true);
  });

  it('rejects event_type with a space', () => {
    const e = validEvent();
    e['event_type'] = 'Step Completed';
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
  });

  it('rejects event_type that is a single character', () => {
    const e = validEvent();
    e['event_type'] = 'S';
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
  });

  it('accepts event_type with digits (e.g. Agent2Heartbeat)', () => {
    const e = validEvent();
    e['event_type'] = 'Agent2Heartbeat';
    expect(EnvelopeValidator.validateEvent(e)).toEqual({ ok: true });
  });

  it('rejects schema_version = 0', () => {
    const e = validEvent();
    e['schema_version'] = 0;
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'schema_version')).toBe(true);
  });

  it('rejects schema_version that is a float', () => {
    const e = validEvent();
    e['schema_version'] = 1.5;
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
  });

  it('rejects empty correlation_id', () => {
    const e = validEvent();
    e['correlation_id'] = '';
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'correlation_id')).toBe(true);
  });

  it('rejects empty causation_id', () => {
    const e = validEvent();
    e['causation_id'] = '   ';
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'causation_id')).toBe(true);
  });

  it('rejects empty org_id', () => {
    const e = validEvent();
    e['org_id'] = '';
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
  });

  it('rejects empty agent_id', () => {
    const e = validEvent();
    e['agent_id'] = '';
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
  });

  it('rejects occurred_at without Z suffix', () => {
    const e = validEvent();
    e['occurred_at'] = '2026-08-06T12:00:00+05:30';
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'occurred_at')).toBe(true);
  });

  it('rejects occurred_at that is not ISO8601', () => {
    const e = validEvent();
    e['occurred_at'] = '06/08/2026';
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
  });

  it('accepts occurred_at with fractional seconds', () => {
    const e = validEvent();
    e['occurred_at'] = '2026-08-06T12:00:00.123Z';
    expect(EnvelopeValidator.validateEvent(e)).toEqual({ ok: true });
  });

  it('rejects sequence = 0', () => {
    const e = validEvent();
    e['sequence'] = 0;
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'sequence')).toBe(true);
  });

  it('rejects sequence that is negative', () => {
    const e = validEvent();
    e['sequence'] = -1;
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
  });

  it('rejects null payload', () => {
    const e = validEvent();
    e['payload'] = null;
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'payload')).toBe(true);
  });

  it('rejects undefined payload', () => {
    const e = validEvent();
    delete e['payload'];
    const r = EnvelopeValidator.validateEvent(e);
    expect(r.ok).toBe(false);
  });

  it('accepts empty object {} as payload', () => {
    const e = validEvent();
    e['payload'] = {};
    expect(EnvelopeValidator.validateEvent(e)).toEqual({ ok: true });
  });

  it('accumulates multiple errors', () => {
    const r = EnvelopeValidator.validateEvent({
      event_id:       'bad',
      event_type:     'bad type',
      schema_version: 0,
      correlation_id: '',
      causation_id:   '',
      org_id:         '',
      agent_id:       '',
      occurred_at:    'not-a-date',
      sequence:       0,
      payload:        null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(3);
  });
});

// ─── CommandEnvelope validation ───────────────────────────────────────────────

describe('EnvelopeValidator.validateCommand', () => {
  it('returns ok for a valid command envelope', () => {
    expect(EnvelopeValidator.validateCommand(validCommand())).toEqual({ ok: true });
  });

  it('rejects null', () => {
    expect(EnvelopeValidator.validateCommand(null).ok).toBe(false);
  });

  it('rejects malformed command_id UUID', () => {
    const c = validCommand();
    c['command_id'] = 'not-uuid';
    const r = EnvelopeValidator.validateCommand(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'command_id')).toBe(true);
  });

  it('rejects command_type starting with lowercase', () => {
    const c = validCommand();
    c['command_type'] = 'runSession';
    const r = EnvelopeValidator.validateCommand(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'command_type')).toBe(true);
  });

  it('rejects empty correlation_id', () => {
    const c = validCommand();
    c['correlation_id'] = '';
    expect(EnvelopeValidator.validateCommand(c).ok).toBe(false);
  });

  it('rejects empty org_id', () => {
    const c = validCommand();
    c['org_id'] = '';
    expect(EnvelopeValidator.validateCommand(c).ok).toBe(false);
  });

  it('rejects issued_at without Z suffix', () => {
    const c = validCommand();
    c['issued_at'] = '2026-08-06T12:00:00';
    const r = EnvelopeValidator.validateCommand(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'issued_at')).toBe(true);
  });

  it('rejects null payload', () => {
    const c = validCommand();
    c['payload'] = null;
    const r = EnvelopeValidator.validateCommand(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(x => x.field === 'payload')).toBe(true);
  });
});
