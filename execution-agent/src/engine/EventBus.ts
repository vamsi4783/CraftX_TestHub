// ─── Event Bus ────────────────────────────────────────────────────────────────
// Multicast, asynchronous event dispatch.
// publish() validates → persists → routes. Delivery is sequential and ordered.
// Subscriber exceptions are caught and logged — one bad subscriber never breaks
// others. Duplicate event_ids (same process) are rejected immediately.

import type { EventEnvelope } from '../events/envelope.js';
import type { EventRegistry } from '../events/EventRegistry.js';
import { EventValidationError } from '../events/EventRegistry.js';
import type { EventStore } from './EventStore.js';
import { EnvelopeValidator } from '../events/EnvelopeValidator.js';
import { StructuredLogger } from '../logging/StructuredLogger.js';

// ─── Errors ──────────────────────────────────────────────────────────────────

export class InvalidEnvelopeError extends Error {
  constructor(errors: Array<{ field: string; message: string }>) {
    super(
      `Invalid event envelope: ` +
      errors.map(e => `${e.field}: ${e.message}`).join('; '),
    );
    this.name = 'InvalidEnvelopeError';
  }
}

export class DuplicateEventError extends Error {
  constructor(event_id: string) {
    super(
      `Event already published in this process: ${event_id}. ` +
      `Duplicate delivery prevented — each event_id is published exactly once.`,
    );
    this.name = 'DuplicateEventError';
  }
}

export class UnregisteredEventTypeError extends Error {
  constructor(event_type: string) {
    super(
      `Cannot subscribe to unregistered event type: "${event_type}". ` +
      `Call registry.register() with at least one EventDefinition for this type first.`,
    );
    this.name = 'UnregisteredEventTypeError';
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type EventHandler<P = unknown> = (envelope: EventEnvelope<P>) => Promise<void> | void;
export type SubscriptionId = string;

interface Subscription {
  id:         SubscriptionId;
  event_type: string;
  handler:    EventHandler;
}

// ─── EventBus ────────────────────────────────────────────────────────────────

export class EventBus {
  private readonly logger           = new StructuredLogger('EventBus');
  private readonly subs             = new Map<string, Subscription[]>();
  private readonly publishedEventIds = new Set<string>();
  private subCounter                = 0;

  constructor(
    private readonly registry: EventRegistry,
    private readonly store:    EventStore,
  ) {}

  /**
   * Publish an event.
   *
   * Steps (in order):
   *   1. Validate envelope structure (EnvelopeValidator)
   *   2. Reject duplicates (same event_id in this process)
   *   3. Validate payload (EventRegistry — throws UnknownEventError if unregistered)
   *   4. Serialize via EventRegistry
   *   5. Persist to EventStore
   *   6. Mark event_id as published
   *   7. Deliver to subscribers sequentially (exceptions are logged, not rethrown)
   */
  async publish(envelope: EventEnvelope): Promise<void> {
    const t0 = Date.now();

    // Step 1 — structural validation
    const envResult = EnvelopeValidator.validateEvent(envelope);
    if (!envResult.ok) {
      this.logger.warn('event_rejected_invalid_envelope', {
        event_type:     envelope.event_type,
        correlation_id: envelope.correlation_id,
        result:         'rejected',
        error:          envResult.errors.map(e => `${e.field}: ${e.message}`).join('; '),
      });
      throw new InvalidEnvelopeError(envResult.errors);
    }

    // Step 2 — duplicate guard
    if (this.publishedEventIds.has(envelope.event_id)) {
      this.logger.warn('event_rejected_duplicate', {
        event_type:     envelope.event_type,
        correlation_id: envelope.correlation_id,
        result:         'rejected',
      });
      throw new DuplicateEventError(envelope.event_id);
    }

    // Step 3 — payload validation (also resolves event_type; throws if unregistered)
    const payloadResult = this.registry.validatePayload(envelope);
    if (!payloadResult.ok) {
      this.logger.warn('event_rejected_invalid_payload', {
        event_type:     envelope.event_type,
        correlation_id: envelope.correlation_id,
        result:         'rejected',
        error:          payloadResult.errors.map(e => `${e.field}: ${e.message}`).join('; '),
      });
      throw new EventValidationError(envelope.event_type, payloadResult.errors);
    }

    // Step 4 — serialize
    const serialized = this.registry.serialize(envelope);

    // Step 5 — persist
    await this.store.append(envelope, serialized);

    // Step 6 — mark published (after successful persistence)
    this.publishedEventIds.add(envelope.event_id);

    // Step 7 — deliver to subscribers (sequential, ordered)
    await this._deliver(envelope);

    this.logger.info('event_published', {
      event_type:     envelope.event_type,
      correlation_id: envelope.correlation_id,
      causation_id:   envelope.causation_id,
      duration_ms:    Date.now() - t0,
      result:         'success',
    });
  }

  /**
   * Subscribe to events of a given event_type (all schema versions).
   * Throws UnregisteredEventTypeError if the event_type is not in the registry.
   * Returns a SubscriptionId for use with unsubscribe().
   */
  subscribe<P = unknown>(event_type: string, handler: EventHandler<P>): SubscriptionId {
    if (!this.registry.isTypeRegistered(event_type)) {
      throw new UnregisteredEventTypeError(event_type);
    }

    const id: SubscriptionId = `sub-${++this.subCounter}`;
    const sub: Subscription  = { id, event_type, handler: handler as EventHandler };
    const existing           = this.subs.get(event_type) ?? [];
    this.subs.set(event_type, [...existing, sub]);

    this.logger.debug('event_subscribed', { event_type, subscription_id: id });
    return id;
  }

  /**
   * Remove a subscription. No-op if the id does not exist.
   */
  unsubscribe(id: SubscriptionId): void {
    for (const [event_type, list] of this.subs) {
      const filtered = list.filter(s => s.id !== id);
      if (filtered.length !== list.length) {
        this.subs.set(event_type, filtered);
        this.logger.debug('event_unsubscribed', { event_type, subscription_id: id });
        return;
      }
    }
  }

  /** Deliver an event to all subscribers for its event_type, in subscription order. */
  private async _deliver(envelope: EventEnvelope): Promise<void> {
    const subscribers = this.subs.get(envelope.event_type) ?? [];
    for (const sub of subscribers) {
      try {
        await sub.handler(envelope);
      } catch (err) {
        // One bad subscriber must not block others or reject the publish
        this.logger.error('subscriber_exception', {
          event_type:      envelope.event_type,
          correlation_id:  envelope.correlation_id,
          subscription_id: sub.id,
          result:          'failure',
          error:           String(err),
        });
      }
    }
  }
}
