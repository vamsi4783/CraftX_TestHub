# EventRegistry — Public Contract

**Module**: `src/events/EventRegistry.ts`  
**Phase**: 3 · Milestone 2  
**Role**: Central authority for event type registration, payload validation, and serialization.

---

## Responsibilities

- Map each `(event_type × schema_version)` pair to an `EventDefinition`.
- Validate event payloads using the registered definition.
- Serialize and deserialize envelopes for Event Store persistence.

The registry is **not** responsible for routing, persistence, or subscriptions — those belong to EventBus and EventStore.

---

## API

### `register(def: EventDefinition): void`

Register an `EventDefinition`.

- **Throws** `DuplicateEventDefinitionError` if the same `(event_type × schema_version)` is already registered.
- Registration is permanent for the lifetime of the process.

### `resolve(event_type: string, schema_version: number): EventDefinition`

Resolve the definition for a given pair.

- **Throws** `UnknownEventError` if not registered.

### `validatePayload(envelope: EventEnvelope): ValidationResult`

Validate the `payload` field using the registered definition.

- Returns `{ ok: true }` on success.
- Returns `{ ok: false, errors }` on failure — does **not** throw.
- **Throws** `UnknownEventError` if the event type is not registered.

### `serialize(envelope: EventEnvelope): string`

Serialize to a string for storage. Default: `JSON.stringify`.

### `deserialize(event_type, schema_version, raw): EventEnvelope`

Deserialize a stored string back to an envelope. Default: `JSON.parse`.

### `isRegistered(event_type, schema_version): boolean`

True if the exact pair is registered.

### `isTypeRegistered(event_type): boolean`

True if any version of the event_type is registered.

### `registeredTypes(): Array<{event_type, schema_version}>`

All registered pairs — for diagnostics only.

---

## Errors

| Error | Thrown when |
|---|---|
| `DuplicateEventDefinitionError` | `register()` called with an already-registered pair |
| `UnknownEventError` | `resolve()`, `serialize()`, `deserialize()`, or `validatePayload()` called for unregistered type |
| `EventValidationError` | Thrown by EventBus after checking `validatePayload()` result |

---

## Invariants

- One definition per `(event_type × schema_version)` — no overwriting.
- The registry is append-only — no deregistration.
- Payload validation uses the definition's `validate()` — the registry applies no additional checks.
