-- =============================================================
-- TestHub M10 — Project Ingestion & Project Intelligence
-- =============================================================
-- Persists ONLY compact metadata/index/summaries.
-- Raw project source files are NEVER stored here.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE project_source_kind AS ENUM (
  'zip', 'local_folder', 'github', 'google_drive', 'onedrive'
);

CREATE TYPE ingestion_status AS ENUM (
  'never', 'source_connected', 'scanning', 'filtering',
  'analyzing', 'indexing', 'understanding', 'ready',
  'failed', 'cancelled', 'stale', 'reindex_required'
);

-- ── project_sources ──────────────────────────────────────────
-- One row per connected source per project.

CREATE TABLE project_sources (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind              project_source_kind NOT NULL,
  display_name      TEXT        NOT NULL,
  remote_url        TEXT,
  branch            TEXT,
  head_ref          TEXT,
  status            ingestion_status NOT NULL DEFAULT 'never',
  error_message     TEXT,
  total_files       INTEGER,
  indexed_files     INTEGER,
  ignored_files     INTEGER,
  sensitive_files   INTEGER,
  total_size_bytes  BIGINT,
  last_indexed_at   TIMESTAMPTZ,
  config            JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_sources_project ON project_sources(project_id);

-- ── project_file_indexes ─────────────────────────────────────
-- One row per source; replaced on full re-index.
-- entries[] stores compact FileIndexEntry objects — paths, hashes, categories.
-- Raw file content is NEVER stored here.

CREATE TABLE project_file_indexes (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id        UUID        NOT NULL REFERENCES project_sources(id) ON DELETE CASCADE,
  project_id       UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  indexed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  head_ref         TEXT,
  schema_version   INTEGER     NOT NULL DEFAULT 1,
  total_files      INTEGER     NOT NULL DEFAULT 0,
  ignored_files    INTEGER     NOT NULL DEFAULT 0,
  binary_files     INTEGER     NOT NULL DEFAULT 0,
  sensitive_files  INTEGER     NOT NULL DEFAULT 0,
  total_size_bytes BIGINT      NOT NULL DEFAULT 0,
  language_stats   JSONB       NOT NULL DEFAULT '{}',
  entries          JSONB       NOT NULL DEFAULT '[]',
  error_paths      TEXT[]      DEFAULT '{}'
);

CREATE UNIQUE INDEX ux_file_index_source ON project_file_indexes(source_id);
CREATE INDEX idx_file_index_project ON project_file_indexes(project_id);
CREATE INDEX idx_file_index_entries  ON project_file_indexes USING GIN(entries);

-- ── project_knowledge ────────────────────────────────────────
-- One row per project; rebuilt on re-analyze.
-- Stores compact summaries, symbols, relationships — NOT raw source.

CREATE TABLE project_knowledge (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_id           UUID        NOT NULL REFERENCES project_sources(id) ON DELETE CASCADE,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schema_version      INTEGER     NOT NULL DEFAULT 1,
  -- Identity
  name                TEXT,
  description         TEXT,
  purpose             TEXT,
  languages           TEXT[]      DEFAULT '{}',
  frameworks          TEXT[]      DEFAULT '{}',
  build_system        TEXT,
  test_frameworks     TEXT[]      DEFAULT '{}',
  architecture_style  TEXT,
  -- Structure (compact JSONB — summaries/symbols only, no raw source)
  code_modules        JSONB       NOT NULL DEFAULT '[]',
  entry_points        JSONB       NOT NULL DEFAULT '[]',
  dependencies        JSONB       NOT NULL DEFAULT '[]',
  config_files        TEXT[]      DEFAULT '{}',
  -- Test intelligence
  existing_test_paths TEXT[]      DEFAULT '{}',
  covered_modules     TEXT[]      DEFAULT '{}',
  uncovered_modules   TEXT[]      DEFAULT '{}',
  coverage_score      NUMERIC(4,3) DEFAULT 0,
  -- File summaries (purpose + symbols + imports — NOT raw source)
  file_summaries      JSONB       NOT NULL DEFAULT '[]',
  -- Stats
  total_files         INTEGER     DEFAULT 0,
  indexed_files       INTEGER     DEFAULT 0,
  ignored_files       INTEGER     DEFAULT 0,
  sensitive_files     INTEGER     DEFAULT 0,
  language_stats      JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ux_knowledge_project ON project_knowledge(project_id);
CREATE INDEX idx_knowledge_source   ON project_knowledge(source_id);
CREATE INDEX idx_knowledge_modules  ON project_knowledge USING GIN(code_modules);
CREATE INDEX idx_knowledge_files    ON project_knowledge USING GIN(file_summaries);

-- ── Row-Level Security ────────────────────────────────────────

ALTER TABLE project_sources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_file_indexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_knowledge    ENABLE ROW LEVEL SECURITY;

-- Read: any project member
CREATE POLICY "ps_member_read" ON project_sources FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = project_sources.project_id AND user_id = auth.uid()
  ));

-- Write: administrator or developer
CREATE POLICY "ps_dev_write" ON project_sources FOR ALL
  USING (EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = project_sources.project_id
      AND user_id = auth.uid()
      AND role IN ('administrator','developer')
  ));

CREATE POLICY "pfi_member_read" ON project_file_indexes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = project_file_indexes.project_id AND user_id = auth.uid()
  ));

CREATE POLICY "pfi_dev_write" ON project_file_indexes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = project_file_indexes.project_id
      AND user_id = auth.uid()
      AND role IN ('administrator','developer')
  ));

CREATE POLICY "pk_member_read" ON project_knowledge FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = project_knowledge.project_id AND user_id = auth.uid()
  ));

CREATE POLICY "pk_dev_write" ON project_knowledge FOR ALL
  USING (EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = project_knowledge.project_id
      AND user_id = auth.uid()
      AND role IN ('administrator','developer')
  ));
