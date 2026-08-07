// ─── Milestone 8: MessageSerializer Tests ────────────────────────────────────

import { MessageSerializer, MessageParseError } from '../../communication/MessageSerializer.js';
import { PROTOCOL_VERSION }                     from '../../communication/MessageProtocol.js';
import type { CommandMessage, EventMessage }    from '../../communication/MessageProtocol.js';

function makeCommand(overrides: Partial<CommandMessage> = {}): CommandMessage {
  return {
    messageId:       '01926000-0000-7000-a000-000000000001',
    correlationId:   'corr-001',
    timestamp:       '2026-08-07T10:00:00.000Z',
    protocolVersion: PROTOCOL_VERSION,
    type:            'Command',
    commandType:     'GetHealth',
    payload:         {},
    ...overrides,
  };
}

// ─── serialize ────────────────────────────────────────────────────────────────

describe('MessageSerializer.serialize', () => {
  const s = new MessageSerializer();

  it('produces valid JSON', () => {
    const raw = s.serialize(makeCommand());
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('round-trips type field', () => {
    const raw = s.serialize(makeCommand());
    expect(JSON.parse(raw).type).toBe('Command');
  });

  it('round-trips commandType field', () => {
    const raw = s.serialize(makeCommand({ commandType: 'CancelExecution' }));
    expect(JSON.parse(raw).commandType).toBe('CancelExecution');
  });

  it('round-trips protocolVersion', () => {
    const raw = s.serialize(makeCommand());
    expect(JSON.parse(raw).protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it('serializes EventMessage correctly', () => {
    const msg: EventMessage = {
      messageId: 'ev-001', correlationId: 'c', timestamp: '2026-08-07T00:00:00Z',
      protocolVersion: PROTOCOL_VERSION, type: 'Event',
      eventType: 'StepCompleted', payload: { step: 1 },
    };
    const parsed = JSON.parse(s.serialize(msg));
    expect(parsed.eventType).toBe('StepCompleted');
  });
});

// ─── parse ────────────────────────────────────────────────────────────────────

describe('MessageSerializer.parse', () => {
  const s = new MessageSerializer();

  it('round-trips a Command', () => {
    const cmd = makeCommand();
    const parsed = s.parse(s.serialize(cmd));
    expect(parsed.type).toBe('Command');
    expect((parsed as CommandMessage).commandType).toBe('GetHealth');
  });

  it('round-trips an AuthHandshake', () => {
    const handshake = {
      messageId: 'h-001', correlationId: 'c', timestamp: '2026-08-07T00:00:00Z',
      protocolVersion: PROTOCOL_VERSION, type: 'AuthHandshake' as const,
      agentId: 'agent-1', agentVersion: '1.0.0', organizationId: 'org-1', token: 'tok',
    };
    const parsed = s.parse(s.serialize(handshake));
    expect(parsed.type).toBe('AuthHandshake');
  });

  it('round-trips a HeartbeatMessage', () => {
    const hb = {
      messageId: 'h-001', correlationId: 'c', timestamp: '2026-08-07T00:00:00Z',
      protocolVersion: PROTOCOL_VERSION, type: 'Heartbeat' as const,
      payload: {
        agent_version: '1.0.0', agent_id: 'a', uptime_seconds: 10,
        connected_to_supabase: false, ws_clients_connected: 0,
        cpu_percent: 5, memory_used_mb: 100, memory_total_mb: 8192,
        active_executions: 0, queue_depth: 0, completed_today: 0,
        connected_devices: [],
      },
    };
    const parsed = s.parse(s.serialize(hb));
    expect(parsed.type).toBe('Heartbeat');
  });

  it('throws MessageParseError on invalid JSON', () => {
    expect(() => s.parse('not json')).toThrow(MessageParseError);
  });

  it('throws MessageParseError on JSON array', () => {
    expect(() => s.parse('[1,2,3]')).toThrow(MessageParseError);
  });

  it('throws MessageParseError on missing type', () => {
    const obj = { messageId: 'x', correlationId: 'c', timestamp: 't', protocolVersion: '1.0' };
    expect(() => s.parse(JSON.stringify(obj))).toThrow(MessageParseError);
  });

  it('throws MessageParseError on missing messageId', () => {
    const obj = { type: 'Command', correlationId: 'c', timestamp: 't', protocolVersion: '1.0' };
    expect(() => s.parse(JSON.stringify(obj))).toThrow(MessageParseError);
  });

  it('throws MessageParseError on unknown type', () => {
    const obj = { messageId: 'x', correlationId: 'c', timestamp: 't', protocolVersion: '1.0', type: 'Unknown' };
    expect(() => s.parse(JSON.stringify(obj))).toThrow(MessageParseError);
  });

  it('MessageParseError.raw contains the original string', () => {
    const raw = 'not-json';
    try {
      s.parse(raw);
    } catch (err) {
      expect((err as MessageParseError).raw).toBe(raw);
    }
  });
});
