-- Phase 4 M9: Intelligent Regression Analysis

-- ─── Main regression reports ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regression_reports (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_version         TEXT        NOT NULL,
  to_version           TEXT        NOT NULL,
  changed_files        JSONB       NOT NULL DEFAULT '[]',
  overall_risk         FLOAT       NOT NULL DEFAULT 0,
  critical_count       INT         NOT NULL DEFAULT 0,
  high_count           INT         NOT NULL DEFAULT 0,
  suggested_test_count INT         NOT NULL DEFAULT 0,
  estimated_total_time BIGINT      NOT NULL DEFAULT 0,

  -- Detailed data stored as JSON for flexibility
  impacted_areas       JSONB       NOT NULL DEFAULT '[]',
  risk_scores          JSONB       NOT NULL DEFAULT '[]',
  suggestions          JSONB       NOT NULL DEFAULT '[]',
  ai_insights          JSONB,
  summary              JSONB,

  -- Full serialized report for fast reload
  report_json          TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID        REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_regression_reports_versions
  ON regression_reports(from_version, to_version);

CREATE INDEX IF NOT EXISTS idx_regression_reports_created
  ON regression_reports(created_at DESC);

-- ─── Risk history — tracks risk score per area over time ─────────────────────
CREATE TABLE IF NOT EXISTS regression_risk_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID        REFERENCES regression_reports(id) ON DELETE CASCADE,
  area_id         TEXT        NOT NULL,
  area_name       TEXT        NOT NULL,
  risk_score      FLOAT       NOT NULL,
  risk_tier       TEXT        NOT NULL,
  from_version    TEXT        NOT NULL,
  to_version      TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_history_area
  ON regression_risk_history(area_id, created_at DESC);

-- ─── Coverage snapshots — coverage percentage at time of analysis ─────────────
CREATE TABLE IF NOT EXISTS regression_coverage_snapshots (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         UUID        REFERENCES regression_reports(id) ON DELETE CASCADE,
  area_name         TEXT        NOT NULL,
  coverage_score    FLOAT       NOT NULL DEFAULT 0,
  test_case_count   INT         NOT NULL DEFAULT 0,
  covered           BOOLEAN     NOT NULL DEFAULT false,
  from_version      TEXT        NOT NULL,
  to_version        TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coverage_snapshots_report
  ON regression_coverage_snapshots(report_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE regression_reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE regression_risk_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE regression_coverage_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read regression reports"
  ON regression_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert regression reports"
  ON regression_reports FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read risk history"
  ON regression_risk_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert risk history"
  ON regression_risk_history FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read coverage snapshots"
  ON regression_coverage_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert coverage snapshots"
  ON regression_coverage_snapshots FOR INSERT TO authenticated WITH CHECK (true);
