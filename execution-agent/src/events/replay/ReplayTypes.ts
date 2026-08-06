// ─── Event Replay Contracts ───────────────────────────────────────────────────
// Interfaces only — implementation deferred to Phase 5.
// Defined now so all storage adapters are designed to be replay-capable
// without refactoring their public signatures later.

import type { EventEnvelope } from '../envelope.js';

/** Identifies a position within a correlation_id event stream. */
export interface ReplayCursor {
  correlation_id: string;
  /** Inclusive start sequence number. Use 1 to replay from the beginning. */
  from_sequence: number;
  /** Inclusive end sequence number. Omit to replay to the latest event. */
  to_sequence?: number;
}

/** Options controlling a replay operation. */
export interface ReplayOptions {
  cursor: ReplayCursor;
  /** Filter to specific event types. Omit to receive all types. */
  event_types?: string[];
  /** Events per batch returned by replay(). Default: 100. */
  batch_size?: number;
  /** Hard cap on total events returned. Omit for no limit. */
  max_events?: number;
}

/** Result from a single replay() call. */
export interface ReplayResult {
  events: EventEnvelope[];
  /** Cursor to pass on the next call when has_more is true. Undefined at end. */
  cursor_next?: ReplayCursor;
  /** True when more events exist beyond this batch. */
  has_more: boolean;
  /** Total events returned in this call (not the full stream total). */
  total_replayed: number;
}

/**
 * Contract for Event Stores that support event replay.
 *
 * replay()      — paginated batch query; callers loop until has_more is false.
 * replayFrom()  — async iterable; callers use for-await without managing cursors.
 *
 * Both methods must be side-effect-free: replaying does not re-publish to subscribers.
 */
export interface IReplayableEventStore {
  replay(options: ReplayOptions): Promise<ReplayResult>;
  replayFrom(cursor: ReplayCursor): AsyncIterable<EventEnvelope>;
}
