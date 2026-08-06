# EventBus — Public Contract

**Module**: `src/engine/EventBus.ts`  
**Phase**: 3 · Milestone 2  
**Role**: Multicast event dispatcher with persistence, deduplication, and subscriber isolation.

---

## Responsibilities

- Validate, persist, deduplicate, and fan-out events to subscribers.
- Guarantee **deterministic delivery order** within a process.
- Isolate subscriber exceptions — one bad subscriber never breaks others.

---

## API

### `publish(envelope: EventEnvelope): Promise<void>`

Publish an event. Steps performed in strict order:

1. Validate envelope structure (`EnvelopeValidator.validateEvent`)
2. Reject duplicate `event_id` (same process)
3. Validate payload (`EventRegistry.validatePayload`)
4. Serialize via `EventRegistry.serialize`
5. Persist to `EventStore`
6. Mark `event_id` as published (prevents replay on retry)
7. Deliver to subscribers sequentially — subscriber exceptions are logged, not rethrown

**Throws**:
- `InvalidEnvelopeError` — bad envelope structure
- `DuplicateEventError` — same `event_id` published twice in this process
- `UnknownEventError` — event_type not in registry
- `EventValidationError` — payload fails definition validation
- Persistence errors from EventStore propagate unmodified

### `subscribe<P>(event_type, handler): SubscriptionId`

Subscribe to all events of the given `event_type` (all schema versions).

- **Throws** `UnregisteredEventTypeError` if no definition is registered for `event_type`.
- Returns a `SubscriptionId` for use with `unsubscribe()`.

### `unsubscribe(id: SubscriptionId): void`

Remove a subscription. No-op if the id does not exist.

---

## Guarantees

| Guarantee | Implementation |
|---|---|
| Ordered delivery | Subscribers called with `for…of await` in registration order |
| No duplicate delivery | `publishedEventIds` Set tracks within-process event_ids |
| Subscriber isolation | Try/catch around each handler; exceptions logged, not propagated |
| Persist-before-deliver | EventStore.append() completes before any subscriber is called |

---

## Errors

| Error | Thrown when |
|---|---|
| `InvalidEnvelopeError` | Envelope fails structural validation |
| `DuplicateEventError` | Same `event_id` published twice (same process) |
| `UnregisteredEventTypeError` | `subscribe()` called for unregistered `event_type` |

---

## Invariants

- An event is never delivered to subscribers unless it was successfully persisted.
- Subscriber exceptions are swallowed — `publish()` resolves normally.
- `subscribe()` after `publish()` will not retroactively deliver already-published events.
