// ─── Supabase Event Store Adapter ────────────────────────────────────────────
// Production adapter backed by the execution_events table.
// Created by the migration: 006_phase3_execution_foundation.sql
// Supabase project: TestHub (sdrlluwezrigaxkpfnjb)

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IEventStoreAdapter, EventStoreRecord } from '../IEventStoreAdapter.js';
import { EventStoreImmutabilityError } from '../IEventStoreAdapter.js';

type DbRow = Record<string, unknown>;

export class SupabaseEventStoreAdapter implements IEventStoreAdapter {
  constructor(private readonly supabase: SupabaseClient) {}

  async insert(record: EventStoreRecord): Promise<void> {
    const { error } = await this.supabase
      .from('execution_events')
      .insert(this._toRow(record));

    if (error) {
      // 23505 = unique_violation — event_id already exists
      if (error.code === '23505') throw new EventStoreImmutabilityError(record.event_id);
      throw new Error(`EventStore insert failed: ${error.message}`);
    }
  }

  async insertBatch(records: EventStoreRecord[]): Promise<void> {
    if (records.length === 0) return;

    const { error } = await this.supabase
      .from('execution_events')
      .insert(records.map(r => this._toRow(r)));

    if (error) {
      if (error.code === '23505') {
        throw new EventStoreImmutabilityError('(batch — duplicate event_id)');
      }
      throw new Error(`EventStore insertBatch failed: ${error.message}`);
    }
  }

  async findByEventId(event_id: string): Promise<EventStoreRecord | null> {
    const { data, error } = await this.supabase
      .from('execution_events')
      .select('*')
      .eq('event_id', event_id)
      .maybeSingle();

    if (error) throw new Error(`EventStore findByEventId failed: ${error.message}`);
    return data ? this._fromRow(data as DbRow) : null;
  }

  async findByCorrelationId(correlation_id: string): Promise<EventStoreRecord[]> {
    const { data, error } = await this.supabase
      .from('execution_events')
      .select('*')
      .eq('correlation_id', correlation_id)
      .order('sequence', { ascending: true });

    if (error) throw new Error(`EventStore findByCorrelationId failed: ${error.message}`);
    return ((data ?? []) as DbRow[]).map(r => this._fromRow(r));
  }

  private _toRow(r: EventStoreRecord): DbRow {
    return {
      event_id:       r.event_id,
      event_type:     r.event_type,
      schema_version: r.schema_version,
      causation_id:   r.causation_id,
      correlation_id: r.correlation_id,
      org_id:         r.org_id,
      agent_id:       r.agent_id,
      occurred_at:    r.occurred_at,
      sequence:       r.sequence,
      payload:        r.payload,
      storage_tier:   r.storage_tier,
      archived_at:    r.archived_at,
    };
  }

  private _fromRow(row: DbRow): EventStoreRecord {
    return {
      event_id:       row['event_id']       as string,
      event_type:     row['event_type']     as string,
      schema_version: row['schema_version'] as number,
      causation_id:   (row['causation_id']  as string | null) ?? null,
      correlation_id: row['correlation_id'] as string,
      org_id:         row['org_id']         as string,
      agent_id:       row['agent_id']       as string,
      occurred_at:    row['occurred_at']    as string,
      sequence:       row['sequence']       as number,
      payload:        row['payload'],
      raw:            JSON.stringify(row['payload']),
      storage_tier:   (row['storage_tier']  as 'hot' | 'warm' | 'cold') ?? 'hot',
      archived_at:    (row['archived_at']   as string | null) ?? null,
      created_at:     row['created_at']     as string,
    };
  }
}
