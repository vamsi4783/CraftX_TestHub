-- Phase 4 M4: Assertion Engine — stores per-step assertion results within a run
CREATE TABLE IF NOT EXISTS assertion_results (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            TEXT        NOT NULL,  -- references autonomous_run_results.run_id
  test_case_id      UUID        NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  step_id           UUID,
  step_number       INT         NOT NULL,
  assertion_kind    TEXT        NOT NULL,
  status            TEXT        NOT NULL CHECK (status IN ('PASS','FAIL','ERROR','SKIPPED')),
  expected          TEXT        NOT NULL DEFAULT '',
  actual            TEXT        NOT NULL DEFAULT '',
  message           TEXT        NOT NULL DEFAULT '',
  duration_ms       BIGINT      NOT NULL DEFAULT 0,
  evidence_type     TEXT,       -- 'screenshot' | 'page_source' | 'activity_dump' | 'metadata'
  evidence_url      TEXT,       -- storage URL of captured evidence
  negated           BOOLEAN     NOT NULL DEFAULT false,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assertion_results_run
  ON assertion_results(run_id, step_number);

CREATE INDEX IF NOT EXISTS idx_assertion_results_test_case
  ON assertion_results(test_case_id, created_at DESC);
