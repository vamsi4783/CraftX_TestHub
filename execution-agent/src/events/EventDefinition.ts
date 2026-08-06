// ─── Event Definition ─────────────────────────────────────────────────────────
// Interface that every concrete event type must implement and register.
// The EventRegistry is the sole authority for resolving definitions.

import type { EventEnvelope } from './envelope.js';
import type { ValidationResult } from './ValidationResult.js';

/**
 * Describes a single (event_type × schema_version) pair.
 * Register one definition per version — the registry routes by (type, version).
 */
export interface EventDefinition<P = unknown> {
  /** Matches the event_type field on emitted EventEnvelopes. PascalCase. */
  readonly event_type: string;
  /** Schema version this definition handles. Increment on breaking payload changes. */
  readonly schema_version: number;

  /** Validate only the payload — envelope fields are validated by EnvelopeValidator. */
  validate(payload: unknown): ValidationResult;

  /** Serialize the full envelope to a string for Event Store persistence. */
  serialize(envelope: EventEnvelope<P>): string;

  /** Deserialize a stored string back to a typed EventEnvelope. */
  deserialize(raw: string): EventEnvelope<P>;
}

/**
 * JSON-based base class. Extend and provide validate().
 * serialize/deserialize use JSON.stringify / JSON.parse by default.
 */
export abstract class JsonEventDefinition<P> implements EventDefinition<P> {
  abstract readonly event_type: string;
  abstract readonly schema_version: number;
  abstract validate(payload: unknown): ValidationResult;

  serialize(envelope: EventEnvelope<P>): string {
    return JSON.stringify(envelope);
  }

  deserialize(raw: string): EventEnvelope<P> {
    return JSON.parse(raw) as EventEnvelope<P>;
  }
}
