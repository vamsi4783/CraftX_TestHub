-- Phase 4 M5: Visual Comparison Engine
-- Tracks stored baselines and comparison run history.

-- ─── Baseline registry ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visual_baselines (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_key    TEXT        NOT NULL UNIQUE,
  test_case_id    UUID        REFERENCES test_cases(id) ON DELETE SET NULL,
  step_id         UUID,
  step_number     INT,
  driver_kind     TEXT        NOT NULL DEFAULT 'unknown',
  width_px        INT         NOT NULL DEFAULT 0,
  height_px       INT         NOT NULL DEFAULT 0,
  size_bytes      BIGINT      NOT NULL DEFAULT 0,
  storage_path    TEXT,       -- future: path in Supabase Storage bucket
  note            TEXT,
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visual_baselines_test_case
  ON visual_baselines(test_case_id);

-- ─── Comparison history ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visual_comparison_results (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          TEXT        NOT NULL,
  test_case_id    UUID        NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  step_id         UUID,
  step_number     INT         NOT NULL,
  baseline_key    TEXT        NOT NULL,
  status          TEXT        NOT NULL CHECK (status IN ('PASS','FAIL','ERROR','SKIPPED')),
  mode            TEXT        NOT NULL DEFAULT 'exact',
  diff_percent    NUMERIC(8,4) NOT NULL DEFAULT 0,
  diff_pixels     BIGINT      NOT NULL DEFAULT 0,
  total_pixels    BIGINT      NOT NULL DEFAULT 0,
  threshold       NUMERIC(8,4) NOT NULL DEFAULT 0,
  tolerance       INT          NOT NULL DEFAULT 0,
  baseline_w      INT,
  baseline_h      INT,
  current_w       INT,
  current_h       INT,
  resized         BOOLEAN     NOT NULL DEFAULT false,
  ignored_regions INT         NOT NULL DEFAULT 0,
  message         TEXT        NOT NULL DEFAULT '',
  error           TEXT,
  duration_ms     BIGINT      NOT NULL DEFAULT 0,
  -- evidence paths (Supabase Storage)
  baseline_url    TEXT,
  current_url     TEXT,
  diff_url        TEXT,
  overlay_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visual_comparison_run
  ON visual_comparison_results(run_id, step_number);

CREATE INDEX IF NOT EXISTS idx_visual_comparison_test_case
  ON visual_comparison_results(test_case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visual_comparison_baseline_key
  ON visual_comparison_results(baseline_key, created_at DESC);
