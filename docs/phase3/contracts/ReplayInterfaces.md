# Event Replay Interfaces — Public Contract

**Module**: `src/events/replay/ReplayTypes.ts`  
**Phase**: 3 · Milestone 2 (contracts only — implementation Phase 5)  
**Role**: Define the replay protocol so storage adapters are designed replay-capable from day one.

---

## Why define now?

All Event Store implementations (`InMemoryEventStoreAdapter`, `SupabaseEventStoreAdapter`) are being written in Phase 3. Defining the replay contract now means Phase 5 implements it without refactoring storage. The interfaces are a no-cost design lock-in.

---

## Interfaces

### `ReplayCursor`

Identifies a position in a correlation_id event stream.

```typescript
interface ReplayCursor {
  correlation_id: string;
  from_sequence:  number;     // inclusive start; use 1 for the beginning
  to_sequence?:   number;     // inclusive end; omit for latest
}
```

### `ReplayOptions`

Controls a replay operation.

```typescript
interface ReplayOptions {
  cursor:       ReplayCursor;
  event_types?: string[];     // filter to specific types; omit for all
  batch_size?:  number;       // events per page; default 100
  max_events?:  number;       // hard cap; omit for no limit
}
```

### `ReplayResult`

Returned by one `replay()` call.

```typescript
interface ReplayResult {
  events:        EventEnvelope[];
  cursor_next?:  ReplayCursor;  // present when has_more is true
  has_more:      boolean;
  total_replayed: number;        // count for this call only
}
```

### `IReplayableEventStore`

Contract for stores that support replay. Implemented in Phase 5.

```typescript
interface IReplayableEventStore {
  // Paginated — callers loop until has_more is false
  replay(options: ReplayOptions): Promise<ReplayResult>;

  // Async iterable — callers use for-await without cursor management
  replayFrom(cursor: ReplayCursor): AsyncIterable<EventEnvelope>;
}
```

---

## Usage pattern (Phase 5)

```typescript
// Paginated
let cursor: ReplayCursor = { correlation_id: sessionId, from_sequence: 1 };
let more = true;
while (more) {
  const result = await store.replay({ cursor, batch_size: 50 });
  for (const ev of result.events) { /* process */ }
  more = result.has_more;
  if (result.cursor_next) cursor = result.cursor_next;
}

// Async iterable
for await (const ev of store.replayFrom({ correlation_id: sessionId, from_sequence: 1 })) {
  /* process one event at a time */
}
```

---

## Constraints

- Replay is **read-only** and **side-effect-free** — replaying does not re-publish to EventBus subscribers.
- Replay operates on the persisted record, not the in-memory EventBus state.
