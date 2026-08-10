-- =============================================================
-- TestHub M12 — Test Traceability & JSON Import Support
-- =============================================================
-- Adds lightweight provenance metadata to test_cases so that
-- AI-generated, JSON-imported, and manually-created cases can
-- be distinguished without breaking the canonical TestCase model.
--
-- IMPORTANT: raw project source is NEVER stored here.
-- Only compact identifiers and generation metadata.
-- =============================================================

-- ── ai_generation_metadata column ────────────────────────────
-- Null for manually-created test cases.
-- For AI-generated cases: {source_type, project_id, generation_mode, ...}
-- For JSON-imported cases: {source_type: "json_import", ...}

ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS ai_generation_metadata JSONB DEFAULT NULL;

-- Index to allow filtering "AI-generated" vs "manual" cases efficiently.
CREATE INDEX IF NOT EXISTS idx_tc_ai_metadata
  ON test_cases USING GIN(ai_generation_metadata)
  WHERE ai_generation_metadata IS NOT NULL;

-- Optional: add a generated column for quick source_type filtering
-- (deferred — can be added in a future migration if reporting needs it)

COMMENT ON COLUMN test_cases.ai_generation_metadata IS
  'Compact provenance for AI-generated or JSON-imported cases. Null = manual creation. Never stores raw source code.';
