-- Phase 4 M3: Autonomous Runner — stores run reports per test case
CREATE TABLE IF NOT EXISTS autonomous_run_results (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id    UUID        NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  run_id          TEXT        NOT NULL,
  mode            TEXT        NOT NULL CHECK (mode IN ('Manual','SemiAuto','FullyAuto')),
  state           TEXT        NOT NULL,
  total_steps     INT         NOT NULL DEFAULT 0,
  passed_steps    INT         NOT NULL DEFAULT 0,
  failed_steps    INT         NOT NULL DEFAULT 0,
  skipped_steps   INT         NOT NULL DEFAULT 0,
  evidence_count  INT         NOT NULL DEFAULT 0,
  duration_ms     BIGINT      NOT NULL DEFAULT 0,
  error           TEXT,
  cancel_reason   TEXT,
  step_progress   JSONB       NOT NULL DEFAULT '[]',
  timeline_events JSONB       NOT NULL DEFAULT '[]',
  started_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ,
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autonomous_run_results_test_case
  ON autonomous_run_results(test_case_id, created_at DESC);
