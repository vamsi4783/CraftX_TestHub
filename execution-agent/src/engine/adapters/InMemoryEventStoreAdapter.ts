// ─── In-Memory Event Store Adapter ───────────────────────────────────────────
// Used by unit tests and local development without Supabase.
// Data is lost when the process exits — NOT suitable for production.

import type { IEventStoreAdapter, EventStoreRecord } from '../IEventStoreAdapter.js';
import { EventStoreImmutabilityError } from '../IEventStoreAdapter.js';

export class InMemoryEventStoreAdapter implements IEventStoreAdapter {
  private readonly store = new Map<string, EventStoreRecord>();

  async insert(record: EventStoreRecord): Promise<void> {
    if (this.store.has(record.event_id)) {
      throw new EventStoreImmutabilityError(record.event_id);
    }
    this.store.set(record.event_id, { ...record });
  }

  async insertBatch(records: EventStoreRecord[]): Promise<void> {
    if (records.length === 0) return;

    // Validate uniqueness within the batch first
    const batchIds = new Set<string>();
    for (const rec of records) {
      if (batchIds.has(rec.event_id)) {
        throw new EventStoreImmutabilityError(rec.event_id);
      }
      batchIds.add(rec.event_id);
    }

    // Then validate against the existing store (check all before writing any)
    for (const rec of records) {
      if (this.store.has(rec.event_id)) {
        throw new EventStoreImmutabilityError(rec.event_id);
      }
    }

    // All checks passed — write atomically
    for (const rec of records) {
      this.store.set(rec.event_id, { ...rec });
    }
  }

  async findByEventId(event_id: string): Promise<EventStoreRecord | null> {
    return this.store.get(event_id) ?? null;
  }

  async findByCorrelationId(correlation_id: string): Promise<EventStoreRecord[]> {
    return Array.from(this.store.values())
      .filter(r => r.correlation_id === correlation_id)
      .sort((a, b) => a.sequence - b.sequence);
  }

  /** Test helper — total records stored. */
  size(): number { return this.store.size; }

  /** Test helper — all records as an array. */
  all(): EventStoreRecord[] { return Array.from(this.store.values()); }

  /** Test helper — reset to empty state. */
  clear(): void { this.store.clear(); }
}
