-- Phase 4 M7: Self-Healing Automation
-- Stores healing attempts, accepted/rejected decisions, and execution history.

-- ─── Healing attempts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS healing_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              TEXT        NOT NULL,
  session_id          TEXT        NOT NULL,
  step_id             TEXT        NOT NULL,
  step_number         INTEGER     NOT NULL,

  -- Outcome
  outcome             TEXT        NOT NULL CHECK (outcome IN ('healed','failed','not_applicable')),
  strategy_used       TEXT,
  confidence          NUMERIC(4,3),
  original_error      TEXT        NOT NULL,

  -- Locators
  original_locator_strategy  TEXT,
  original_locator_value     TEXT,
  resolved_locator_strategy  TEXT,
  resolved_locator_value     TEXT,
  explanation         TEXT,

  -- Evidence
  retry_count         INTEGER     NOT NULL DEFAULT 0,
  alternatives_json   JSONB       DEFAULT '[]'::jsonb,

  -- Review
  reviewed            BOOLEAN     NOT NULL DEFAULT FALSE,
  user_decision       TEXT        CHECK (user_decision IN ('accepted','rejected')),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         UUID        REFERENCES auth.users(id),

  -- Notes
  user_notes          TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookup by run and session
CREATE INDEX IF NOT EXISTS idx_healing_events_run_id
  ON healing_events(run_id);

CREATE INDEX IF NOT EXISTS idx_healing_events_session_id
  ON healing_events(session_id);

CREATE INDEX IF NOT EXISTS idx_healing_events_step_id
  ON healing_events(step_id);

CREATE INDEX IF NOT EXISTS idx_healing_events_outcome
  ON healing_events(outcome);

CREATE INDEX IF NOT EXISTS idx_healing_events_reviewed
  ON healing_events(reviewed) WHERE reviewed = FALSE;

-- ─── Accepted healings (locator update proposals) ─────────────────────────────
-- When a user "accepts" a healed locator, we record the proposed update here.
-- The application layer applies it only when the user explicitly triggers the update.
CREATE TABLE IF NOT EXISTS healing_accepted_proposals (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  healing_event_id      UUID        NOT NULL REFERENCES healing_events(id),
  step_id               TEXT        NOT NULL,
  automation_config_id  UUID,       -- optional link to the source automation config
  original_selector     TEXT,
  proposed_selector     TEXT        NOT NULL,
  locator_strategy      TEXT,
  confidence            NUMERIC(4,3),
  accepted_by           UUID        REFERENCES auth.users(id),
  applied               BOOLEAN     NOT NULL DEFAULT FALSE,
  applied_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_healing_proposals_event_id
  ON healing_accepted_proposals(healing_event_id);

CREATE INDEX IF NOT EXISTS idx_healing_proposals_applied
  ON healing_accepted_proposals(applied) WHERE applied = FALSE;

-- ─── Healing run summary ──────────────────────────────────────────────────────
-- One row per AutonomousRunner run that had self-healing active.
CREATE TABLE IF NOT EXISTS healing_run_summaries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          TEXT        NOT NULL UNIQUE,
  session_id      TEXT        NOT NULL,
  test_case_id    TEXT,
  total_events    INTEGER     NOT NULL DEFAULT 0,
  healed_count    INTEGER     NOT NULL DEFAULT 0,
  failed_count    INTEGER     NOT NULL DEFAULT 0,
  na_count        INTEGER     NOT NULL DEFAULT 0,
  strategies_used JSONB       DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_healing_run_summaries_run_id
  ON healing_run_summaries(run_id);

-- ─── Row-level security ───────────────────────────────────────────────────────
ALTER TABLE healing_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE healing_accepted_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE healing_run_summaries      ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all healing data
CREATE POLICY "healing_events_read" ON healing_events
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "healing_events_insert" ON healing_events
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "healing_events_update" ON healing_events
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "healing_proposals_read" ON healing_accepted_proposals
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "healing_proposals_insert" ON healing_accepted_proposals
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "healing_proposals_update" ON healing_accepted_proposals
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "healing_summaries_all" ON healing_run_summaries
  FOR ALL USING (auth.role() = 'authenticated');
