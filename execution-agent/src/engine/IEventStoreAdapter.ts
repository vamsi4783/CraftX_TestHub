// ─── Event Store Adapter Interface ────────────────────────────────────────────
// Abstracts the persistence layer so InMemoryEventStoreAdapter (tests) and
// SupabaseEventStoreAdapter (production) are interchangeable.

/** Raw row as it exists in the persistence layer. */
export interface EventStoreRecord {
  event_id:       string;
  event_type:     string;
  schema_version: number;
  causation_id:   string | null;
  correlation_id: string;
  org_id:         string;
  agent_id:       string;
  occurred_at:    string;
  sequence:       number;
  payload:        unknown;
  /** Full serialized envelope string — used for exact-fidelity replay. */
  raw:            string;
  storage_tier:   'hot' | 'warm' | 'cold';
  archived_at:    string | null;
  created_at:     string;
}

export class EventStoreImmutabilityError extends Error {
  constructor(event_id: string) {
    super(
      `Cannot overwrite immutable event: ${event_id}. ` +
      `The Event Store is append-only — no UPDATE or DELETE in Phase 3–6.`,
    );
    this.name = 'EventStoreImmutabilityError';
  }
}

export interface IEventStoreAdapter {
  /**
   * Insert one record. Throws EventStoreImmutabilityError if event_id already exists.
   */
  insert(record: EventStoreRecord): Promise<void>;

  /**
   * Insert multiple records atomically. All succeed or all fail.
   * Throws EventStoreImmutabilityError on any duplicate event_id (within the batch
   * or against existing records).
   */
  insertBatch(records: EventStoreRecord[]): Promise<void>;

  /** Find one record by event_id. Returns null if not found. */
  findByEventId(event_id: string): Promise<EventStoreRecord | null>;

  /** Find all records for a correlation_id, ordered by sequence ASC. */
  findByCorrelationId(correlation_id: string): Promise<EventStoreRecord[]>;
}
