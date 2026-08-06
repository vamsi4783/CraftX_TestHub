// ─── Milestone 2: CommandBus Tests ───────────────────────────────────────────

import { CommandBus,
         DuplicateHandlerError,
         UnknownCommandError,
         InvalidCommandEnvelopeError } from '../../engine/CommandBus.js';
import type { CommandEnvelope } from '../../events/envelope.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function validEnvelope(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    command_id:     '550e8400-e29b-41d4-a716-446655440000',
    command_type:   'RunSession',
    correlation_id: 'session-abc',
    org_id:         'org-xyz',
    issued_at:      '2026-08-06T12:00:00Z',
    payload:        { session_id: 'session-abc' },
    ...overrides,
  };
}

// ─── registerHandler ──────────────────────────────────────────────────────────

describe('CommandBus.registerHandler', () => {
  it('registers a handler without error', () => {
    const bus = new CommandBus();
    expect(() => bus.registerHandler('RunSession', async () => {})).not.toThrow();
  });

  it('hasHandler returns true after registration', () => {
    const bus = new CommandBus();
    bus.registerHandler('RunSession', async () => {});
    expect(bus.hasHandler('RunSession')).toBe(true);
  });

  it('hasHandler returns false for unregistered command', () => {
    const bus = new CommandBus();
    expect(bus.hasHandler('GhostCommand')).toBe(false);
  });

  it('throws DuplicateHandlerError on second registration', () => {
    const bus = new CommandBus();
    bus.registerHandler('RunSession', async () => {});
    expect(() => bus.registerHandler('RunSession', async () => {}))
      .toThrow(DuplicateHandlerError);
  });

  it('allows different commands to register independently', () => {
    const bus = new CommandBus();
    expect(() => {
      bus.registerHandler('RunSession',      async () => {});
      bus.registerHandler('PauseSession',    async () => {});
      bus.registerHandler('CancelExecution', async () => {});
    }).not.toThrow();
  });
});

// ─── execute — success ────────────────────────────────────────────────────────

describe('CommandBus.execute — success', () => {
  it('invokes the registered handler', async () => {
    const bus     = new CommandBus();
    const calls: string[] = [];
    bus.registerHandler('RunSession', async (env) => {
      calls.push(env.command_type);
    });
    await bus.execute(validEnvelope());
    expect(calls).toEqual(['RunSession']);
  });

  it('passes the full envelope to the handler', async () => {
    const bus = new CommandBus();
    let received: CommandEnvelope | null = null;
    bus.registerHandler('RunSession', async (env) => { received = env; });
    const env = validEnvelope({ correlation_id: 'check-me' });
    await bus.execute(env);
    expect(received?.correlation_id).toBe('check-me');
  });

  it('resolves cleanly when the handler resolves', async () => {
    const bus = new CommandBus();
    bus.registerHandler('RunSession', async () => {});
    await expect(bus.execute(validEnvelope())).resolves.toBeUndefined();
  });
});

// ─── execute — errors ─────────────────────────────────────────────────────────

describe('CommandBus.execute — errors', () => {
  it('throws InvalidCommandEnvelopeError for a malformed envelope', async () => {
    const bus = new CommandBus();
    bus.registerHandler('RunSession', async () => {});
    const bad = validEnvelope({ command_id: 'not-a-uuid' });
    await expect(bus.execute(bad)).rejects.toThrow(InvalidCommandEnvelopeError);
  });

  it('throws UnknownCommandError when no handler is registered', async () => {
    const bus = new CommandBus();
    await expect(bus.execute(validEnvelope())).rejects.toThrow(UnknownCommandError);
  });

  it('propagates handler exceptions to the caller', async () => {
    const bus = new CommandBus();
    bus.registerHandler('RunSession', async () => {
      throw new Error('handler exploded');
    });
    await expect(bus.execute(validEnvelope())).rejects.toThrow('handler exploded');
  });

  it('does not swallow handler exceptions', async () => {
    const bus = new CommandBus();
    const boom = new Error('BOOM');
    bus.registerHandler('RunSession', async () => { throw boom; });
    try {
      await bus.execute(validEnvelope());
      fail('should have thrown');
    } catch (err) {
      expect(err).toBe(boom);
    }
  });

  it('rejects command_type starting with lowercase', async () => {
    const bus = new CommandBus();
    const bad = validEnvelope({ command_type: 'runSession' });
    await expect(bus.execute(bad)).rejects.toThrow(InvalidCommandEnvelopeError);
  });

  it('rejects missing issued_at', async () => {
    const bus = new CommandBus();
    const bad = { ...validEnvelope() } as Record<string, unknown>;
    delete bad['issued_at'];
    await expect(bus.execute(bad as CommandEnvelope)).rejects.toThrow(InvalidCommandEnvelopeError);
  });
});

// ─── ordering ─────────────────────────────────────────────────────────────────

describe('CommandBus — sequential execution', () => {
  it('awaits each command before resolving', async () => {
    const bus    = new CommandBus();
    const order: string[] = [];
    bus.registerHandler('RunSession', async () => {
      await new Promise<void>(res => setTimeout(res, 10));
      order.push('done');
    });
    await bus.execute(validEnvelope());
    expect(order).toEqual(['done']);
  });
});
