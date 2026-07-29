-- ============================================================
-- Phase 3: Bug Lifecycle, Release Management & QA Workflow
-- FIX: update_updated_at_column → update_updated_at
-- FIX: explicit ::text casts for enum values in bug_history inserts
-- ============================================================

-- 1. Extend bugs table
ALTER TABLE bugs
  ADD COLUMN IF NOT EXISTS browser            TEXT,
  ADD COLUMN IF NOT EXISTS root_cause         TEXT,
  ADD COLUMN IF NOT EXISTS resolution_notes   TEXT,
  ADD COLUMN IF NOT EXISTS fix_version        TEXT,
  ADD COLUMN IF NOT EXISTS commit_ref         TEXT,
  ADD COLUMN IF NOT EXISTS pull_request       TEXT,
  ADD COLUMN IF NOT EXISTS files_changed      TEXT,
  ADD COLUMN IF NOT EXISTS closed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS test_plan_id       UUID REFERENCES test_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS test_session_id    UUID REFERENCES test_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retested_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retested_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS watcher_count      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_by         UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Drop old status check constraint and add extended one
DO $$
DECLARE v_name TEXT;
BEGIN
  SELECT conname INTO v_name FROM pg_constraint
  WHERE conrelid = 'bugs'::regclass AND contype = 'c' AND conname ILIKE '%status%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE bugs DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE bugs
  ADD CONSTRAINT bugs_status_check
  CHECK (status IN (
    'new','triaged','assigned','in_progress',
    'ready_for_qa','retesting','verified','closed',
    'rejected','duplicate','cannot_reproduce','wont_fix'
  ));

-- 2. bug_relationships
CREATE TABLE IF NOT EXISTS bug_relationships (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_id          UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  related_bug_id  UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  relationship    TEXT NOT NULL CHECK (relationship IN ('duplicate_of','blocks','blocked_by','related','parent','child')),
  created_by      UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bug_id, related_bug_id, relationship)
);

-- 3. bug_watchers
CREATE TABLE IF NOT EXISTS bug_watchers (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_id     UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bug_id, user_id)
);

-- 4. bug_attachments
CREATE TABLE IF NOT EXISTS bug_attachments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_id       UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  comment_id   UUID REFERENCES bug_comments(id) ON DELETE SET NULL,
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  file_type    TEXT NOT NULL,
  file_size    INTEGER,
  uploaded_by  UUID NOT NULL REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 5. release_builds
CREATE TABLE IF NOT EXISTS release_builds (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  release_id   UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL CHECK (platform IN ('android_apk','android_aab','ios_ipa','web','desktop','other')),
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  file_size    BIGINT,
  checksum     TEXT,
  version      TEXT NOT NULL,
  build_number TEXT,
  notes        TEXT,
  is_latest    BOOLEAN DEFAULT FALSE,
  uploaded_by  UUID NOT NULL REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 6. release_documents (extended)
CREATE TABLE IF NOT EXISTS release_documents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  release_id   UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  doc_type     TEXT NOT NULL CHECK (doc_type IN ('user_manual','developer_handbook','qa_guide','release_notes','known_issues','test_report','changelog','other')),
  name         TEXT NOT NULL,
  description  TEXT,
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  file_size    BIGINT,
  version      TEXT,
  uploaded_by  UUID NOT NULL REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 7. qa_approvals
CREATE TABLE IF NOT EXISTS qa_approvals (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  release_id            UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected','needs_more_testing')),
  approved_by           UUID REFERENCES profiles(id),
  checklist             JSONB NOT NULL DEFAULT '{
    "critical_bugs_closed": false,
    "required_tests_executed": false,
    "coverage_target_reached": false,
    "no_blocked_tests": false,
    "release_notes_completed": false,
    "known_issues_documented": false,
    "regression_passed": false
  }'::jsonb,
  notes                 TEXT,
  action_taken_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (release_id)
);

-- 8. Indexes
CREATE INDEX IF NOT EXISTS idx_bug_relationships_bug    ON bug_relationships(bug_id);
CREATE INDEX IF NOT EXISTS idx_bug_watchers_bug         ON bug_watchers(bug_id);
CREATE INDEX IF NOT EXISTS idx_bug_watchers_user        ON bug_watchers(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_attachments_bug      ON bug_attachments(bug_id);
CREATE INDEX IF NOT EXISTS idx_release_builds_release   ON release_builds(release_id);
CREATE INDEX IF NOT EXISTS idx_release_docs_release     ON release_documents(release_id);
CREATE INDEX IF NOT EXISTS idx_qa_approvals_release     ON qa_approvals(release_id);

-- 9. Triggers (FIXED: update_updated_at not update_updated_at_column)
CREATE TRIGGER set_updated_at_release_docs
  BEFORE UPDATE ON release_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_qa_approvals
  BEFORE UPDATE ON qa_approvals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-set closed_at
CREATE OR REPLACE FUNCTION set_bug_closed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('closed','verified') AND OLD.status NOT IN ('closed','verified') THEN
    NEW.closed_at := NOW();
  END IF;
  IF NEW.status NOT IN ('closed','verified') AND OLD.status IN ('closed','verified') THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bug_closed_at ON bugs;
CREATE TRIGGER trg_bug_closed_at
  BEFORE UPDATE ON bugs FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION set_bug_closed_at();

-- Auto-record bug_history (FIXED: explicit ::text casts for enum columns)
CREATE OR REPLACE FUNCTION auto_log_bug_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO bug_history(bug_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, COALESCE(NEW.updated_by, NEW.reported_by), 'status', OLD.status::text, NEW.status::text);
  END IF;
  IF OLD.severity IS DISTINCT FROM NEW.severity THEN
    INSERT INTO bug_history(bug_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, COALESCE(NEW.updated_by, NEW.reported_by), 'severity', OLD.severity::text, NEW.severity::text);
  END IF;
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO bug_history(bug_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, COALESCE(NEW.updated_by, NEW.reported_by), 'priority', OLD.priority::text, NEW.priority::text);
  END IF;
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO bug_history(bug_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, COALESCE(NEW.updated_by, NEW.reported_by), 'assigned_to',
      (SELECT full_name FROM profiles WHERE id = OLD.assigned_to),
      (SELECT full_name FROM profiles WHERE id = NEW.assigned_to));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_bug_history ON bugs;
CREATE TRIGGER trg_auto_bug_history
  AFTER UPDATE ON bugs FOR EACH ROW EXECUTE FUNCTION auto_log_bug_history();

-- 10. RLS
ALTER TABLE bug_relationships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_watchers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_attachments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_builds     ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_approvals       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_bug_relationships" ON bug_relationships FOR ALL USING ((select auth.role()) = 'authenticated');
CREATE POLICY "auth_bug_watchers"      ON bug_watchers      FOR ALL USING ((select auth.role()) = 'authenticated');
CREATE POLICY "auth_bug_attachments"   ON bug_attachments   FOR ALL USING ((select auth.role()) = 'authenticated');
CREATE POLICY "auth_release_builds"    ON release_builds    FOR ALL USING ((select auth.role()) = 'authenticated');
CREATE POLICY "auth_release_documents" ON release_documents FOR ALL USING ((select auth.role()) = 'authenticated');
CREATE POLICY "auth_qa_approvals"      ON qa_approvals      FOR ALL USING ((select auth.role()) = 'authenticated');
