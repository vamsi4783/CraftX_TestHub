// ─── Command Bus ──────────────────────────────────────────────────────────────
// Unicast, synchronous command dispatch. Exactly one handler per command_type.
// Validates the envelope, routes to the handler, awaits completion.
// Handler exceptions propagate to the caller — the bus does not swallow them.

import type { CommandEnvelope } from '../events/envelope.js';
import { EnvelopeValidator } from '../events/EnvelopeValidator.js';
import { StructuredLogger } from '../logging/StructuredLogger.js';

// ─── Errors ──────────────────────────────────────────────────────────────────

export class DuplicateHandlerError extends Error {
  constructor(command_type: string) {
    super(
      `Handler already registered for command: ${command_type}. ` +
      `Each command_type must have exactly one handler.`,
    );
    this.name = 'DuplicateHandlerError';
  }
}

export class UnknownCommandError extends Error {
  constructor(command_type: string) {
    super(
      `No handler registered for command: ${command_type}. ` +
      `Call registerHandler() before executing this command.`,
    );
    this.name = 'UnknownCommandError';
  }
}

export class InvalidCommandEnvelopeError extends Error {
  constructor(errors: Array<{ field: string; message: string }>) {
    super(
      `Invalid command envelope: ` +
      errors.map(e => `${e.field}: ${e.message}`).join('; '),
    );
    this.name = 'InvalidCommandEnvelopeError';
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type CommandHandler<P = unknown> = (envelope: CommandEnvelope<P>) => Promise<void>;

// ─── CommandBus ──────────────────────────────────────────────────────────────

export class CommandBus {
  private readonly logger  = new StructuredLogger('CommandBus');
  private readonly handlers = new Map<string, CommandHandler>();

  /**
   * Register a handler for a command_type.
   * Throws DuplicateHandlerError if a handler is already registered.
   */
  registerHandler<P = unknown>(command_type: string, handler: CommandHandler<P>): void {
    if (this.handlers.has(command_type)) {
      throw new DuplicateHandlerError(command_type);
    }
    this.handlers.set(command_type, handler as CommandHandler);
    this.logger.debug('command_handler_registered', { command_type });
  }

  /**
   * Execute a command.
   * 1. Validates envelope structure via EnvelopeValidator.
   * 2. Resolves and invokes the registered handler.
   * 3. Awaits completion and propagates handler exceptions.
   */
  async execute<P = unknown>(envelope: CommandEnvelope<P>): Promise<void> {
    const t0 = Date.now();

    const result = EnvelopeValidator.validateCommand(envelope);
    if (!result.ok) {
      this.logger.warn('command_rejected_invalid_envelope', {
        command_type:   envelope.command_type,
        correlation_id: envelope.correlation_id,
        result:         'rejected',
        error:          result.errors.map(e => `${e.field}: ${e.message}`).join('; '),
      });
      throw new InvalidCommandEnvelopeError(result.errors);
    }

    const handler = this.handlers.get(envelope.command_type);
    if (!handler) {
      this.logger.warn('command_rejected_unknown', {
        command_type:   envelope.command_type,
        correlation_id: envelope.correlation_id,
        result:         'rejected',
      });
      throw new UnknownCommandError(envelope.command_type);
    }

    this.logger.info('command_executing', {
      command_type:   envelope.command_type,
      correlation_id: envelope.correlation_id,
    });

    try {
      await handler(envelope as CommandEnvelope);
      this.logger.info('command_completed', {
        command_type:   envelope.command_type,
        correlation_id: envelope.correlation_id,
        duration_ms:    Date.now() - t0,
        result:         'success',
      });
    } catch (err) {
      this.logger.error('command_failed', {
        command_type:   envelope.command_type,
        correlation_id: envelope.correlation_id,
        duration_ms:    Date.now() - t0,
        result:         'failure',
        error:          String(err),
      });
      throw err;
    }
  }

  /** Returns true if a handler is registered for the given command_type. */
  hasHandler(command_type: string): boolean {
    return this.handlers.has(command_type);
  }
}
