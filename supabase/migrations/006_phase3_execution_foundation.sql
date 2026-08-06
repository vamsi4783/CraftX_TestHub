-- ─────────────────────────────────────────────────────────────────────────────
-- TestHub Phase 3 — Execution Foundation
-- Migration: 006_phase3_execution_foundation.sql
-- Project: TestHub (sdrlluwezrigaxkpfnjb)
--
-- Creates:
--   1. execution_events       — append-only CQRS Event Store
--   2. Archival flags         — on test_executions, execution_step_results,
--                               execution_attachments
--   3. Extended evidence cols — full EvidenceItem metadata on execution_attachments
--   4. automation_config col  — on test_steps
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. execution_events — CQRS Event Store ──────────────────────────────────
-- Append-only. No UPDATE. No DELETE during Phase 3–6.
-- Phase 7 archival only updates archived_at and storage_tier.
-- RLS enforces org isolation.

create table if not exists execution_events (
  -- Primary key: local DB UUID
  id              uuid        primary key default gen_random_uuid(),

  -- V5 CQRS Event Envelope fields (all required, match EventEnvelope type exactly)
  event_id        text        not null unique,   -- UUID v7 from agent (time-ordered)
  event_type      text        not null,
  schema_version  int         not null default 1,
  causation_id    text,                          -- null for self-caused events (heartbeat)
  correlation_id  text        not null,          -- session_id groups one session's events
  org_id          text        not null,
  agent_id        text        not null,
  occurred_at     timestamptz not null,
  sequence        int         not null,          -- monotonic per correlation_id
  payload         jsonb       not null default '{}',

  -- Archival flags (Phase 3 required; Phase 7 writes to these)
  archived_at     timestamptz,
  storage_tier    text        not null default 'hot'
                              check (storage_tier in ('hot', 'warm', 'cold')),

  -- Row metadata
  created_at      timestamptz not null default now()
);

-- Indexes for the two primary access patterns:
-- 1. Replay a session in sequence order
-- 2. Operational queries: event_type × time for monitoring
create index if not exists execution_events_session_idx
  on execution_events (correlation_id, sequence);

create index if not exists execution_events_ops_idx
  on execution_events (org_id, event_type, occurred_at desc);

-- Row Level Security: org members read only their org's events.
alter table execution_events enable row level security;

create policy if not exists "execution_events_org_isolation"
  on execution_events
  using (
    org_id = (
      select org_id from profiles where id = auth.uid()
    )
  );

comment on table execution_events is
  'Append-only CQRS Event Store. Stores all EventEnvelope records emitted by the Execution Agent. '
  'Write-ahead StepIntended records enable crash recovery. No UPDATE or DELETE allowed in Phase 3–6.';


-- ─── 2. Archival flags — all existing execution tables ────────────────────────
-- Designed now so Phase 7 hot→warm→cold migration touches only these columns,
-- never the evidence URL or any other data column.

alter table test_executions
  add column if not exists archived_at   timestamptz,
  add column if not exists storage_tier  text not null default 'hot'
    check (storage_tier in ('hot', 'warm', 'cold'));

alter table execution_step_results
  add column if not exists archived_at   timestamptz,
  add column if not exists storage_tier  text not null default 'hot'
    check (storage_tier in ('hot', 'warm', 'cold'));

alter table execution_attachments
  add column if not exists archived_at   timestamptz,
  add column if not exists storage_tier  text not null default 'hot'
    check (storage_tier in ('hot', 'warm', 'cold'));


-- ─── 3. Extended evidence metadata — execution_attachments ────────────────────
-- Populates the full EvidenceItem model from Phase 3 onwards.
-- All columns nullable for backward compat with pre-Phase-3 rows.

alter table execution_attachments
  -- Identity link to the path-stable storage key
  add column if not exists evidence_id              uuid,
  add column if not exists evidence_type            text,     -- EvidenceType enum

  -- Execution context
  add column if not exists execution_timestamp      timestamptz,
  add column if not exists step_duration_ms         int,
  add column if not exists step_status_at_capture   text,     -- 'running' | 'failed' | 'completed'

  -- Device context (Phase 5 Self-Healing uses all of these)
  add column if not exists device_model             text,
  add column if not exists os_name                  text,
  add column if not exists os_version               text,
  add column if not exists screen_width_px          int,
  add column if not exists screen_height_px         int,
  add column if not exists orientation              text,     -- 'portrait' | 'landscape'

  -- App context (Phase 4 World Model temporal layer)
  add column if not exists app_package              text,
  add column if not exists app_version              text,
  add column if not exists app_build                text,

  -- Driver context (Phase 5 Trust Engine per driver version)
  add column if not exists driver_id                text,
  add column if not exists driver_version           text,
  add column if not exists driver_capabilities      text[];   -- snapshot of manifest capabilities


-- ─── 4. automation_config — test_steps ───────────────────────────────────────
-- Stores the AutomationConfig JSON per step.
-- Schema: { driver_id, action, selector?, value?, timeout_ms?, params? }

alter table test_steps
  add column if not exists automation_config jsonb;

comment on column test_steps.automation_config is
  'Per-step automation configuration (AutomationConfig). '
  'Populated via the Step Automation Editor UI in Phase 3. '
  'Schema: { driver_id: string, action: string, selector?: string, value?: string, '
  'timeout_ms?: number, params?: object }';
