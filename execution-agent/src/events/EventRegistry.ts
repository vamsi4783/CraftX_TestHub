// ─── Event Registry ───────────────────────────────────────────────────────────
// Central authority for event type registration, validation, and serialization.
// Keyed by "EventType@vN". Throws loudly on unregistered or duplicate types.
// No routing, no persistence — those belong to EventBus and EventStore.

import type { EventDefinition } from './EventDefinition.js';
import type { EventEnvelope } from './envelope.js';
import type { ValidationResult } from './ValidationResult.js';

// ─── Errors ──────────────────────────────────────────────────────────────────

export class DuplicateEventDefinitionError extends Error {
  constructor(event_type: string, schema_version: number) {
    super(
      `EventDefinition already registered: ${event_type}@v${schema_version}. ` +
      `Each (event_type × schema_version) pair must be unique.`,
    );
    this.name = 'DuplicateEventDefinitionError';
  }
}

export class UnknownEventError extends Error {
  constructor(event_type: string, schema_version: number) {
    super(
      `No EventDefinition registered for: ${event_type}@v${schema_version}. ` +
      `Call registry.register() before emitting or resolving this type.`,
    );
    this.name = 'UnknownEventError';
  }
}

export class EventValidationError extends Error {
  constructor(
    event_type: string,
    public readonly validationErrors: Array<{ field: string; message: string }>,
  ) {
    super(
      `Payload validation failed for ${event_type}: ` +
      validationErrors.map(e => `${e.field}: ${e.message}`).join('; '),
    );
    this.name = 'EventValidationError';
  }
}

// ─── Registry ────────────────────────────────────────────────────────────────

export class EventRegistry {
  private readonly defs = new Map<string, EventDefinition>();

  private key(event_type: string, schema_version: number): string {
    return `${event_type}@v${schema_version}`;
  }

  /**
   * Register an EventDefinition for a (event_type × schema_version) pair.
   * Throws DuplicateEventDefinitionError if already registered.
   */
  register(def: EventDefinition): void {
    const k = this.key(def.event_type, def.schema_version);
    if (this.defs.has(k)) {
      throw new DuplicateEventDefinitionError(def.event_type, def.schema_version);
    }
    this.defs.set(k, def);
  }

  /**
   * Resolve the definition for a given (event_type × schema_version).
   * Throws UnknownEventError if not registered.
   */
  resolve(event_type: string, schema_version: number): EventDefinition {
    const def = this.defs.get(this.key(event_type, schema_version));
    if (!def) throw new UnknownEventError(event_type, schema_version);
    return def;
  }

  /**
   * Validate the payload of an envelope using the registered definition.
   * Returns ValidationResult — does NOT throw on validation failure.
   * Throws UnknownEventError if the type is not registered.
   */
  validatePayload(envelope: EventEnvelope): ValidationResult {
    const def = this.resolve(envelope.event_type, envelope.schema_version);
    return def.validate(envelope.payload);
  }

  /**
   * Serialize an envelope to a string using the registered definition.
   * Throws UnknownEventError if the type is not registered.
   */
  serialize(envelope: EventEnvelope): string {
    const def = this.resolve(envelope.event_type, envelope.schema_version);
    return def.serialize(envelope);
  }

  /**
   * Deserialize a raw string using the registered definition.
   * Throws UnknownEventError if the type is not registered.
   */
  deserialize(event_type: string, schema_version: number, raw: string): EventEnvelope {
    const def = this.resolve(event_type, schema_version);
    return def.deserialize(raw);
  }

  /** True if at least one definition is registered for this event_type (any version). */
  isTypeRegistered(event_type: string): boolean {
    return this.registeredTypes().some(t => t.event_type === event_type);
  }

  /** True if the exact (event_type × schema_version) pair is registered. */
  isRegistered(event_type: string, schema_version: number): boolean {
    return this.defs.has(this.key(event_type, schema_version));
  }

  /** All registered (event_type × schema_version) pairs — for inspection only. */
  registeredTypes(): Array<{ event_type: string; schema_version: number }> {
    return Array.from(this.defs.values()).map(d => ({
      event_type:     d.event_type,
      schema_version: d.schema_version,
    }));
  }
}
