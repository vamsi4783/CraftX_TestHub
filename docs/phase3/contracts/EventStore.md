# EventStore — Public Contract

**Module**: `src/engine/EventStore.ts`  
**Phase**: 3 · Milestone 2  
**Role**: Append-only persistence for EventEnvelopes. No UPDATE. No DELETE (Phase 3–6).

---

## Responsibilities

- Persist events durably (Supabase in production; in-memory for tests).
- Guarantee immutability — duplicate `event_id` is always rejected.
- Load events by `event_id`, `correlation_id`, or `execution_id`.

---

## API

### `append(envelope, serialized): Promise<void>`

Persist one event.

- `serialized` — pre-computed string from `EventRegistry.serialize()`.
- **Throws** `EventStoreImmutabilityError` if `event_id` already exists.
- Logs success/failure via `StructuredLogger`.

### `appendBatch(pairs): Promise<void>`

Persist multiple events atomically. All succeed or all fail.

- `pairs` — `Array<{ envelope, serialized }>`.
- **Throws** `EventStoreImmutabilityError` on any duplicate (within batch or vs. existing).
- No-op for empty array.

### `load(event_id): Promise<EventEnvelope | null>`

Retrieve one event by `event_id`. Returns `null` if not found.

### `loadByExecution(execution_id): Promise<EventEnvelope[]>`

Load all events for an execution session, ordered by `sequence` ASC.

In Phase 3, `execution_id === correlation_id` — the session ID groups all events.

### `loadByCorrelation(correlation_id): Promise<EventEnvelope[]>`

Load all events for a `correlation_id`, ordered by `sequence` ASC.

---

## Adapters

| Adapter | Use case |
|---|---|
| `InMemoryEventStoreAdapter` | Unit tests, local development |
| `SupabaseEventStoreAdapter` | Production (TestHub project `sdrlluwezrigaxkpfnjb`) |

---

## Immutability Guarantee

The Event Store is append-only. `EventStoreImmutabilityError` is thrown if:

- The same `event_id` is appended twice.
- A batch contains a duplicate `event_id` (within the batch or vs. the store).

Phase 7 archival only updates `archived_at` and `storage_tier` — never event data.

---

## Error

| Error | Thrown when |
|---|---|
| `EventStoreImmutabilityError` | Duplicate `event_id` detected on insert |
