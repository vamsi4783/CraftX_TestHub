-- ============================================================
-- Migration 005: Execution Recorder
-- Sprint: Recording Foundation
-- Tables:  execution_recordings
--          execution_timeline_events
--          execution_screenshots
-- ============================================================
-- IMPORTANT: Binary files (video, logcat, screenshots) are
-- NEVER stored in Supabase. Only metadata paths are stored.
-- All binaries live on the Automation Runner machine.
-- ============================================================

-- ─── execution_recordings ────────────────────────────────────────────────────

create table if not exists execution_recordings (
  id          uuid primary key default gen_random_uuid(),

  -- Context
  test_session_id  uuid references test_sessions(id) on delete set null,
  release_id       uuid references releases(id)      on delete set null,
  build_version    text,
  device_name      text not null,
  device_os        text,
  tester_id        uuid references profiles(id)      not null,
  runner_id        text,   -- identifier of the Automation Runner machine

  -- State machine
  status text not null default 'ready'
    check (status in (
      'idle','ready','recording','paused',
      'stopping','saving','completed','cancelled','error'
    )),

  -- Timing (all in UTC)
  started_at          timestamptz,
  paused_at           timestamptz,
  stopped_at          timestamptz,
  duration_ms         bigint  default 0,       -- net recording time (excl. pauses)
  paused_duration_ms  bigint  default 0,       -- total time spent paused

  -- Local folder root on Automation Runner (e.g. TestHub/Executions/<id>)
  local_folder  text,

  -- Video metadata — file lives on runner, NEVER uploaded
  video_path          text,
  video_size_bytes    bigint,
  video_duration_ms   bigint,
  video_checksum      text,   -- SHA-256 of the mp4

  -- Logcat metadata — file lives on runner, NEVER uploaded
  logcat_path         text,
  logcat_size_bytes   bigint,

  -- Counts (denormalised for list views)
  screenshot_count     int default 0,
  timeline_event_count int default 0,

  -- Result (set when the session is reviewed post-recording)
  result text check (result in ('pass','fail','blocked','skipped')),

  -- Retention: when the video file on the runner can be deleted
  retain_video_until  timestamptz,

  -- Error
  error_message  text,

  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─── execution_timeline_events ────────────────────────────────────────────────

create table if not exists execution_timeline_events (
  id            uuid primary key default gen_random_uuid(),
  recording_id  uuid references execution_recordings(id) on delete cascade not null,

  -- Event type (mirrors TimelineEventType in types.ts)
  event_type   text not null,
  description  text not null,

  -- Offset from recording start (excluding paused time)
  offset_ms    bigint not null default 0,

  -- Optional structured payload (action coords, screenshot path, etc.)
  metadata     jsonb,

  created_at   timestamptz default now()
);

-- ─── execution_screenshots ────────────────────────────────────────────────────

create table if not exists execution_screenshots (
  id            uuid primary key default gen_random_uuid(),
  recording_id  uuid references execution_recordings(id) on delete cascade not null,

  -- manual | failure | final | auto
  screenshot_type   text not null
    check (screenshot_type in ('manual','failure','final','auto')),

  -- Absolute path on Automation Runner — never uploaded
  local_path        text not null,
  file_size_bytes   bigint,

  -- Offset from recording start
  offset_ms         bigint not null default 0,

  -- Optional small thumbnail stored in Supabase Storage (future feature)
  thumbnail_url     text,

  created_at        timestamptz default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists idx_exec_rec_tester
  on execution_recordings(tester_id);

create index if not exists idx_exec_rec_session
  on execution_recordings(test_session_id);

create index if not exists idx_exec_rec_release
  on execution_recordings(release_id);

create index if not exists idx_exec_rec_status
  on execution_recordings(status);

create index if not exists idx_exec_timeline_rec
  on execution_timeline_events(recording_id, offset_ms);

create index if not exists idx_exec_screenshots_rec
  on execution_screenshots(recording_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

create or replace function testhub_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger execution_recordings_updated_at
  before update on execution_recordings
  for each row execute function testhub_set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table execution_recordings       enable row level security;
alter table execution_timeline_events  enable row level security;
alter table execution_screenshots      enable row level security;

-- execution_recordings: any authenticated user can read;
-- only the tester or admins/qa can write/delete.
create policy "exec_rec_select"
  on execution_recordings for select
  using (auth.uid() is not null);

create policy "exec_rec_insert"
  on execution_recordings for insert
  with check (auth.uid() = tester_id);

create policy "exec_rec_update"
  on execution_recordings for update
  using (
    auth.uid() = tester_id
    or auth.uid() in (
      select id from profiles where role = 'administrator'
    )
  );

create policy "exec_rec_delete"
  on execution_recordings for delete
  using (auth.uid() = tester_id);

-- Timeline events
create policy "exec_timeline_select"
  on execution_timeline_events for select
  using (auth.uid() is not null);

create policy "exec_timeline_insert"
  on execution_timeline_events for insert
  with check (auth.uid() is not null);

-- Screenshots
create policy "exec_screenshots_select"
  on execution_screenshots for select
  using (auth.uid() is not null);

create policy "exec_screenshots_insert"
  on execution_screenshots for insert
  with check (auth.uid() is not null);
