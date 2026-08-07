-- Phase 4 M8: AI Failure Analysis — stores analysis reports and history

-- ─── Main analysis report ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS failure_analysis_reports (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                     TEXT        NOT NULL,
  test_case_id               UUID        REFERENCES test_cases(id) ON DELETE SET NULL,
  status                     TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','analyzing','complete','failed')),

  -- Deterministic classification
  failure_category           TEXT        NOT NULL DEFAULT 'unknown',
  classification_confidence  FLOAT       NOT NULL DEFAULT 0,
  classification_signals     JSONB       NOT NULL DEFAULT '[]',

  -- AI analysis output (null until AI completes)
  ai_root_cause              TEXT,
  ai_confidence              FLOAT,
  ai_evidence_summary        TEXT,
  ai_likely_source_files     JSONB,
  ai_suggested_fix           TEXT,
  ai_suggested_healing       TEXT,
  ai_regression_probability  FLOAT,
  ai_developer_explanation   TEXT,
  ai_qa_explanation          TEXT,
  ai_raw_response            TEXT,

  -- Recommendations (array of Recommendation objects)
  recommendations            JSONB       NOT NULL DEFAULT '[]',

  -- Snapshot of previous similar failures (for comparison)
  previous_failures          JSONB       NOT NULL DEFAULT '[]',

  -- Execution snapshot (for fast display, avoids re-joining)
  execution_snapshot         JSONB,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_failure_reports_run_id
  ON failure_analysis_reports(run_id);

CREATE INDEX IF NOT EXISTS idx_failure_reports_test_case
  ON failure_analysis_reports(test_case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_failure_reports_category
  ON failure_analysis_reports(failure_category, created_at DESC);

-- ─── Analysis history (lightweight log for regression tracking) ───────────────
CREATE TABLE IF NOT EXISTS failure_analysis_history (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id            UUID        REFERENCES failure_analysis_reports(id) ON DELETE CASCADE,
  test_case_id         UUID        REFERENCES test_cases(id) ON DELETE SET NULL,
  run_id               TEXT        NOT NULL,
  failure_category     TEXT        NOT NULL,
  ai_confidence        FLOAT,
  regression_probability FLOAT,
  resolved             BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_failure_history_test_case
  ON failure_analysis_history(test_case_id, created_at DESC);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE failure_analysis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_analysis_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read failure reports"
  ON failure_analysis_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert failure reports"
  ON failure_analysis_reports FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update failure reports"
  ON failure_analysis_reports FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read failure history"
  ON failure_analysis_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert failure history"
  ON failure_analysis_history FOR INSERT TO authenticated WITH CHECK (true);
