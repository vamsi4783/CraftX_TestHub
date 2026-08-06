// ─── Event Store ──────────────────────────────────────────────────────────────
// Append-only persistence layer for EventEnvelopes.
// All write operations are immutable — no UPDATE, no DELETE.
// Callers pass the serialized raw string; EventStore never calls EventRegistry.

import type { EventEnvelope } from '../events/envelope.js';
import type { IEventStoreAdapter, EventStoreRecord } from './IEventStoreAdapter.js';
import { StructuredLogger } from '../logging/StructuredLogger.js';
import { startSpan, SPANS } from '../otel/stubs.js';

export class EventStore {
  private readonly logger = new StructuredLogger('EventStore');

  constructor(private readonly adapter: IEventStoreAdapter) {}

  /**
   * Persist a single event.
   * Caller must supply the serialized raw string (from EventRegistry.serialize).
   * Throws EventStoreImmutabilityError if event_id already exists.
   */
  async append(envelope: EventEnvelope, serialized: string): Promise<void> {
    const span = startSpan(SPANS.EVENT_STORE_APPEND, { event_type: envelope.event_type });
    const t0 = Date.now();

    try {
      await this.adapter.insert(this._toRecord(envelope, serialized));

      this.logger.info('event_appended', {
        event_type:     envelope.event_type,
        correlation_id: envelope.correlation_id,
        causation_id:   envelope.causation_id,
        duration_ms:    Date.now() - t0,
        result:         'success',
        sequence:       envelope.sequence,
      });
      span.end();
    } catch (err) {
      this.logger.error('event_append_failed', {
        event_type:     envelope.event_type,
        correlation_id: envelope.correlation_id,
        duration_ms:    Date.now() - t0,
        result:         'failure',
        error:          String(err),
      });
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  }

  /**
   * Persist multiple events atomically.
   * Caller must supply pre-serialized strings for each envelope.
   * All succeed or all fail.
   */
  async appendBatch(
    pairs: Array<{ envelope: EventEnvelope; serialized: string }>,
  ): Promise<void> {
    if (pairs.length === 0) return;
    const t0 = Date.now();

    try {
      const records = pairs.map(({ envelope, serialized }) =>
        this._toRecord(envelope, serialized),
      );
      await this.adapter.insertBatch(records);

      this.logger.info('event_batch_appended', {
        correlation_id: pairs[0]?.envelope.correlation_id,
        duration_ms:    Date.now() - t0,
        result:         'success',
        count:          pairs.length,
      });
    } catch (err) {
      this.logger.error('event_batch_append_failed', {
        duration_ms: Date.now() - t0,
        result:      'failure',
        error:       String(err),
        count:       pairs.length,
      });
      throw err;
    }
  }

  /** Load a single event by event_id. Returns null if not found. */
  async load(event_id: string): Promise<EventEnvelope | null> {
    const record = await this.adapter.findByEventId(event_id);
    return record ? this._fromRecord(record) : null;
  }

  /**
   * Load all events for an execution session (correlation_id = session ID).
   * Ordered by sequence ASC.
   */
  async loadByExecution(execution_id: string): Promise<EventEnvelope[]> {
    // In Phase 3, execution_id === correlation_id (session_id groups one session)
    return this.loadByCorrelation(execution_id);
  }

  /** Load all events for a correlation_id. Ordered by sequence ASC. */
  async loadByCorrelation(correlation_id: string): Promise<EventEnvelope[]> {
    const records = await this.adapter.findByCorrelationId(correlation_id);
    return records.map(r => this._fromRecord(r));
  }

  private _toRecord(envelope: EventEnvelope, raw: string): EventStoreRecord {
    return {
      event_id:       envelope.event_id,
      event_type:     envelope.event_type,
      schema_version: envelope.schema_version,
      causation_id:   envelope.causation_id ?? null,
      correlation_id: envelope.correlation_id,
      org_id:         envelope.org_id,
      agent_id:       envelope.agent_id,
      occurred_at:    envelope.occurred_at,
      sequence:       envelope.sequence,
      payload:        envelope.payload,
      raw,
      storage_tier:   'hot',
      archived_at:    null,
      created_at:     new Date().toISOString(),
    };
  }

  private _fromRecord(record: EventStoreRecord): EventEnvelope {
    // Prefer raw deserialization for exact fidelity
    try {
      return JSON.parse(record.raw) as EventEnvelope;
    } catch {
      // Fallback: reconstruct from individual columns
      return {
        event_id:       record.event_id,
        event_type:     record.event_type,
        schema_version: record.schema_version,
        causation_id:   record.causation_id ?? '',
        correlation_id: record.correlation_id,
        org_id:         record.org_id,
        agent_id:       record.agent_id,
        occurred_at:    record.occurred_at,
        sequence:       record.sequence,
        payload:        record.payload,
      };
    }
  }
}
