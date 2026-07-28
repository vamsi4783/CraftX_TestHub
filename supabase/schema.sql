-- =======================================================
-- TestHub QA Platform — Complete PostgreSQL Schema
-- =======================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =======================================================
-- ENUMS
-- =======================================================

CREATE TYPE user_role           AS ENUM ('administrator','developer','qa_tester','viewer');
CREATE TYPE project_status      AS ENUM ('active','inactive','archived');
CREATE TYPE project_platform    AS ENUM ('android','ios','web','desktop','backend','cross_platform');
CREATE TYPE release_status      AS ENUM ('planning','testing','ready','released','archived');
CREATE TYPE tc_priority         AS ENUM ('critical','high','medium','low');
CREATE TYPE tc_status           AS ENUM ('draft','active','deprecated');
CREATE TYPE assignment_status   AS ENUM ('pending','in_progress','completed');
CREATE TYPE result_status       AS ENUM ('pass','fail','blocked','skipped','not_tested');
CREATE TYPE bug_severity        AS ENUM ('critical','high','medium','low');
CREATE TYPE bug_priority        AS ENUM ('p1','p2','p3','p4');
CREATE TYPE bug_status          AS ENUM ('new','triaged','assigned','in_progress','ready_for_qa','verified','closed','rejected','duplicate');
CREATE TYPE feature_priority    AS ENUM ('critical','high','medium','low');
CREATE TYPE feature_status      AS ENUM ('submitted','under_review','approved','in_progress','completed','rejected','deferred');
CREATE TYPE notif_type          AS ENUM ('bug_created','bug_assigned','bug_fixed','bug_comment','release_started','test_assigned','feature_request','test_completed','release_ready');
CREATE TYPE attachment_kind     AS ENUM ('image','video','document','log','zip','other');
CREATE TYPE readiness_verdict   AS ENUM ('not_ready','ready_with_risks','ready_for_release');

-- =======================================================
-- PROFILES
-- =======================================================

CREATE TABLE profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    full_name   TEXT,
    avatar_url  TEXT,
    role        user_role NOT NULL DEFAULT 'viewer',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    preferences JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =======================================================
-- PROJECTS
-- =======================================================

CREATE TABLE projects (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           TEXT NOT NULL,
    slug           TEXT NOT NULL UNIQUE,
    description    TEXT,
    platform       project_platform NOT NULL,
    status         project_status NOT NULL DEFAULT 'active',
    owner_id       UUID NOT NULL REFERENCES profiles(id),
    version        TEXT DEFAULT '1.0.0',
    repository_url TEXT,
    color          TEXT DEFAULT '#4F46E5',
    tags           TEXT[] DEFAULT '{}',
    metadata       JSONB DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_members (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role       user_role NOT NULL DEFAULT 'viewer',
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- =======================================================
-- RELEASES
-- =======================================================

CREATE TABLE releases (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    version       TEXT NOT NULL,
    build_number  TEXT,
    status        release_status NOT NULL DEFAULT 'planning',
    start_date    DATE,
    end_date      DATE,
    release_notes TEXT,
    known_issues  TEXT,
    description   TEXT,
    created_by    UUID NOT NULL REFERENCES profiles(id),
    cloned_from   UUID REFERENCES releases(id),
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE release_documents (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    release_id  UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    file_type   TEXT,
    file_size   BIGINT,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =======================================================
-- MODULES
-- =======================================================

CREATE TABLE modules (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    order_index INTEGER DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_by  UUID NOT NULL REFERENCES profiles(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, name)
);

-- =======================================================
-- TEST CASES
-- =======================================================

CREATE TABLE test_cases (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    module_id           UUID REFERENCES modules(id) ON DELETE SET NULL,
    test_id             TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    priority            tc_priority NOT NULL DEFAULT 'medium',
    status              tc_status NOT NULL DEFAULT 'draft',
    estimated_minutes   INTEGER DEFAULT 15,
    is_automation_ready BOOLEAN DEFAULT FALSE,
    preconditions       TEXT,
    tags                TEXT[] DEFAULT '{}',
    created_by          UUID NOT NULL REFERENCES profiles(id),
    updated_by          UUID REFERENCES profiles(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, test_id)
);

CREATE TABLE test_case_steps (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_case_id    UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    step_number     INTEGER NOT NULL,
    description     TEXT NOT NULL,
    expected_result TEXT NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =======================================================
-- TEST ASSIGNMENTS & RESULTS
-- =======================================================

CREATE TABLE test_assignments (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    release_id   UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    assigned_to  UUID NOT NULL REFERENCES profiles(id),
    assigned_by  UUID NOT NULL REFERENCES profiles(id),
    priority     tc_priority NOT NULL DEFAULT 'medium',
    deadline     DATE,
    status       assignment_status NOT NULL DEFAULT 'pending',
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE test_results (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id   UUID NOT NULL REFERENCES test_assignments(id) ON DELETE CASCADE,
    test_case_id    UUID NOT NULL REFERENCES test_cases(id),
    release_id      UUID NOT NULL REFERENCES releases(id),
    executed_by     UUID NOT NULL REFERENCES profiles(id),
    status          result_status NOT NULL,
    duration_minutes INTEGER,
    notes           TEXT,
    environment     TEXT,
    device_info     TEXT,
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE test_result_step_results (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_result_id UUID NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
    step_id        UUID NOT NULL REFERENCES test_case_steps(id),
    status         result_status NOT NULL,
    actual_result  TEXT,
    notes          TEXT
);

-- =======================================================
-- BUGS
-- =======================================================

CREATE TABLE bugs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    release_id          UUID REFERENCES releases(id) ON DELETE SET NULL,
    module_id           UUID REFERENCES modules(id) ON DELETE SET NULL,
    test_case_id        UUID REFERENCES test_cases(id) ON DELETE SET NULL,
    test_result_id      UUID REFERENCES test_results(id) ON DELETE SET NULL,
    bug_id              TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT NOT NULL,
    severity            bug_severity NOT NULL DEFAULT 'medium',
    priority            bug_priority NOT NULL DEFAULT 'p2',
    status              bug_status NOT NULL DEFAULT 'new',
    assigned_to         UUID REFERENCES profiles(id),
    reported_by         UUID NOT NULL REFERENCES profiles(id),
    device              TEXT,
    os_version          TEXT,
    app_version         TEXT,
    build_number        TEXT,
    environment         TEXT DEFAULT 'staging',
    steps_to_reproduce  TEXT,
    expected_result     TEXT,
    actual_result       TEXT,
    logs                TEXT,
    is_regression       BOOLEAN DEFAULT FALSE,
    duplicate_of        UUID REFERENCES bugs(id),
    tags                TEXT[] DEFAULT '{}',
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, bug_id)
);

CREATE TABLE bug_comments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bug_id      UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES profiles(id),
    content     TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bug_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bug_id      UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
    changed_by  UUID NOT NULL REFERENCES profiles(id),
    field_name  TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =======================================================
-- ATTACHMENTS
-- =======================================================

CREATE TABLE attachments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type TEXT NOT NULL, -- 'bug','feature_request','test_result','test_case_step'
    entity_id   UUID NOT NULL,
    file_name   TEXT NOT NULL,
    file_url    TEXT NOT NULL,
    file_kind   attachment_kind NOT NULL DEFAULT 'other',
    mime_type   TEXT,
    file_size   BIGINT,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =======================================================
-- FEATURE REQUESTS
-- =======================================================

CREATE TABLE feature_requests (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    description    TEXT NOT NULL,
    business_value TEXT,
    category       TEXT,
    priority       feature_priority NOT NULL DEFAULT 'medium',
    status         feature_status NOT NULL DEFAULT 'submitted',
    vote_count     INTEGER DEFAULT 0,
    submitted_by   UUID NOT NULL REFERENCES profiles(id),
    assigned_to    UUID REFERENCES profiles(id),
    roadmap_link   TEXT,
    tags           TEXT[] DEFAULT '{}',
    metadata       JSONB DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE feature_request_votes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature_request_id  UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(feature_request_id, user_id)
);

CREATE TABLE feature_request_comments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature_request_id  UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES profiles(id),
    content             TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =======================================================
-- NOTIFICATIONS
-- =======================================================

CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type        notif_type NOT NULL,
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    entity_type TEXT,
    entity_id   UUID,
    is_read     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =======================================================
-- ACTIVITY & AUDIT LOGS
-- =======================================================

CREATE TABLE activity_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES profiles(id),
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   UUID,
    entity_name TEXT,
    details     JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES profiles(id),
    action      TEXT NOT NULL,
    table_name  TEXT NOT NULL,
    record_id   UUID,
    old_data    JSONB,
    new_data    JSONB,
    ip_address  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =======================================================
-- INDEXES
-- =======================================================

CREATE INDEX idx_projects_status       ON projects(status);
CREATE INDEX idx_projects_owner        ON projects(owner_id);
CREATE INDEX idx_releases_project      ON releases(project_id, status);
CREATE INDEX idx_modules_project       ON modules(project_id);
CREATE INDEX idx_test_cases_project    ON test_cases(project_id, status);
CREATE INDEX idx_test_cases_module     ON test_cases(module_id);
CREATE INDEX idx_assignments_release   ON test_assignments(release_id, status);
CREATE INDEX idx_assignments_user      ON test_assignments(assigned_to);
CREATE INDEX idx_results_release       ON test_results(release_id, status);
CREATE INDEX idx_bugs_project          ON bugs(project_id, status);
CREATE INDEX idx_bugs_severity         ON bugs(severity);
CREATE INDEX idx_bugs_assigned         ON bugs(assigned_to);
CREATE INDEX idx_bugs_release          ON bugs(release_id);
CREATE INDEX idx_fr_project            ON feature_requests(project_id, status);
CREATE INDEX idx_notifications_user    ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_activity_project      ON activity_logs(project_id, created_at DESC);
CREATE INDEX idx_attachments_entity    ON attachments(entity_type, entity_id);

-- Full-text search
CREATE INDEX idx_bugs_fts    ON bugs    USING gin(to_tsvector('english', title||' '||description));
CREATE INDEX idx_tc_fts      ON test_cases USING gin(to_tsvector('english', title||' '||COALESCE(description,'')));
CREATE INDEX idx_fr_fts      ON feature_requests USING gin(to_tsvector('english', title||' '||description));

-- =======================================================
-- FUNCTIONS & TRIGGERS
-- =======================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_upd   BEFORE UPDATE ON profiles          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_projects_upd   BEFORE UPDATE ON projects          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_releases_upd   BEFORE UPDATE ON releases          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_modules_upd    BEFORE UPDATE ON modules           FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tc_upd         BEFORE UPDATE ON test_cases        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ta_upd         BEFORE UPDATE ON test_assignments  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bugs_upd       BEFORE UPDATE ON bugs              FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_fr_upd         BEFORE UPDATE ON feature_requests  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO profiles(id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto bug_id
CREATE OR REPLACE FUNCTION generate_bug_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pfx TEXT; cnt INTEGER;
BEGIN
    SELECT UPPER(SUBSTRING(slug,1,3)) INTO pfx FROM projects WHERE id=NEW.project_id;
    SELECT COUNT(*)+1 INTO cnt FROM bugs WHERE project_id=NEW.project_id;
    NEW.bug_id = pfx||'-BUG-'||LPAD(cnt::TEXT,4,'0');
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_bug_id BEFORE INSERT ON bugs FOR EACH ROW EXECUTE FUNCTION generate_bug_id();

-- Auto test_id
CREATE OR REPLACE FUNCTION generate_test_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pfx TEXT; cnt INTEGER;
BEGIN
    SELECT UPPER(SUBSTRING(slug,1,3)) INTO pfx FROM projects WHERE id=NEW.project_id;
    SELECT COUNT(*)+1 INTO cnt FROM test_cases WHERE project_id=NEW.project_id;
    NEW.test_id = pfx||'-TC-'||LPAD(cnt::TEXT,4,'0');
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_tc_id BEFORE INSERT ON test_cases FOR EACH ROW EXECUTE FUNCTION generate_test_id();

-- Bug history
CREATE OR REPLACE FUNCTION track_bug_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF OLD.status   != NEW.status   THEN INSERT INTO bug_history(bug_id,changed_by,field_name,old_value,new_value) VALUES(NEW.id,auth.uid(),'status',OLD.status::TEXT,NEW.status::TEXT); END IF;
    IF OLD.severity != NEW.severity THEN INSERT INTO bug_history(bug_id,changed_by,field_name,old_value,new_value) VALUES(NEW.id,auth.uid(),'severity',OLD.severity::TEXT,NEW.severity::TEXT); END IF;
    IF OLD.priority != NEW.priority THEN INSERT INTO bug_history(bug_id,changed_by,field_name,old_value,new_value) VALUES(NEW.id,auth.uid(),'priority',OLD.priority::TEXT,NEW.priority::TEXT); END IF;
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN INSERT INTO bug_history(bug_id,changed_by,field_name,old_value,new_value) VALUES(NEW.id,auth.uid(),'assigned_to',OLD.assigned_to::TEXT,NEW.assigned_to::TEXT); END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_bug_history AFTER UPDATE ON bugs FOR EACH ROW EXECUTE FUNCTION track_bug_changes();

-- Vote count
CREATE OR REPLACE FUNCTION update_vote_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='INSERT' THEN UPDATE feature_requests SET vote_count=vote_count+1 WHERE id=NEW.feature_request_id;
    ELSIF TG_OP='DELETE' THEN UPDATE feature_requests SET vote_count=vote_count-1 WHERE id=OLD.feature_request_id;
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER trg_vote_count AFTER INSERT OR DELETE ON feature_request_votes FOR EACH ROW EXECUTE FUNCTION update_vote_count();

-- Release readiness
CREATE OR REPLACE FUNCTION calculate_release_readiness(p_release_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    total_tests INT; completed_tests INT; passed_tests INT;
    total_bugs INT; critical_bugs INT; open_bugs INT;
    testing_pct NUMERIC; pass_rate NUMERIC;
    verdict readiness_verdict;
BEGIN
    SELECT COUNT(*) INTO total_tests     FROM test_assignments WHERE release_id=p_release_id;
    SELECT COUNT(*) INTO completed_tests FROM test_assignments WHERE release_id=p_release_id AND status='completed';
    SELECT COUNT(*) INTO passed_tests    FROM test_results     WHERE release_id=p_release_id AND status='pass';
    SELECT COUNT(*) INTO critical_bugs   FROM bugs WHERE release_id=p_release_id AND severity='critical' AND status NOT IN ('closed','rejected','duplicate');
    SELECT COUNT(*) INTO open_bugs       FROM bugs WHERE release_id=p_release_id AND status IN ('new','triaged','assigned','in_progress');
    SELECT COUNT(*) INTO total_bugs      FROM bugs WHERE release_id=p_release_id AND status NOT IN ('closed','rejected','duplicate');

    testing_pct := CASE WHEN total_tests=0 THEN 0 ELSE ROUND((completed_tests::NUMERIC/total_tests)*100,1) END;
    pass_rate   := CASE WHEN completed_tests=0 THEN 0 ELSE ROUND((passed_tests::NUMERIC/completed_tests)*100,1) END;
    verdict     := CASE
        WHEN critical_bugs>0 OR testing_pct<50                      THEN 'not_ready'
        WHEN open_bugs>0     OR testing_pct<80 OR pass_rate<90      THEN 'ready_with_risks'
        ELSE                                                              'ready_for_release'
    END;

    RETURN jsonb_build_object(
        'testing_percentage', testing_pct, 'pass_rate', pass_rate,
        'total_bugs', total_bugs, 'critical_bugs', critical_bugs,
        'open_bugs', open_bugs, 'verdict', verdict,
        'total_tests', total_tests, 'completed_tests', completed_tests
    );
END;
$$;

-- =======================================================
-- ROW LEVEL SECURITY
-- =======================================================

ALTER TABLE profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE releases                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cases                ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_case_steps           ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_assignments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results              ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_result_step_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bugs                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_comments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_history               ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_request_votes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_request_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                ENABLE ROW LEVEL SECURITY;

-- Helpers
CREATE OR REPLACE FUNCTION is_project_member(p UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS(SELECT 1 FROM project_members WHERE project_id=p AND user_id=auth.uid())
        OR EXISTS(SELECT 1 FROM projects WHERE id=p AND owner_id=auth.uid())
        OR EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='administrator');
END;$$;

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='administrator'); END;$$;

-- Profiles
CREATE POLICY "prof_sel"   ON profiles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "prof_upd"   ON profiles FOR UPDATE TO authenticated USING (id=auth.uid() OR is_admin());

-- Projects
CREATE POLICY "proj_sel"   ON projects FOR SELECT TO authenticated USING (is_project_member(id) OR is_admin());
CREATE POLICY "proj_ins"   ON projects FOR INSERT TO authenticated WITH CHECK (owner_id=auth.uid());
CREATE POLICY "proj_upd"   ON projects FOR UPDATE TO authenticated USING (owner_id=auth.uid() OR is_admin());
CREATE POLICY "proj_del"   ON projects FOR DELETE TO authenticated USING (owner_id=auth.uid() OR is_admin());

-- Project members
CREATE POLICY "pm_sel"     ON project_members FOR SELECT TO authenticated USING (is_project_member(project_id));
CREATE POLICY "pm_ins"     ON project_members FOR INSERT TO authenticated WITH CHECK (
    EXISTS(SELECT 1 FROM projects WHERE id=project_id AND owner_id=auth.uid()) OR is_admin());
CREATE POLICY "pm_del"     ON project_members FOR DELETE TO authenticated USING (
    EXISTS(SELECT 1 FROM projects WHERE id=project_id AND owner_id=auth.uid()) OR is_admin());

-- Releases
CREATE POLICY "rel_all"    ON releases FOR ALL TO authenticated
    USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));
CREATE POLICY "reldoc_all" ON release_documents FOR ALL TO authenticated
    USING (EXISTS(SELECT 1 FROM releases r WHERE r.id=release_id AND is_project_member(r.project_id)));

-- Modules / Test Cases / Assignments / Results
CREATE POLICY "mod_all"    ON modules          FOR ALL TO authenticated USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));
CREATE POLICY "tc_all"     ON test_cases       FOR ALL TO authenticated USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));
CREATE POLICY "tcs_all"    ON test_case_steps  FOR ALL TO authenticated
    USING (EXISTS(SELECT 1 FROM test_cases t WHERE t.id=test_case_id AND is_project_member(t.project_id)));
CREATE POLICY "ta_all"     ON test_assignments FOR ALL TO authenticated
    USING (EXISTS(SELECT 1 FROM test_cases t WHERE t.id=test_case_id AND is_project_member(t.project_id)));
CREATE POLICY "tr_all"     ON test_results     FOR ALL TO authenticated
    USING (EXISTS(SELECT 1 FROM test_cases t WHERE t.id=test_case_id AND is_project_member(t.project_id)));
CREATE POLICY "trsr_all"   ON test_result_step_results FOR ALL TO authenticated
    USING (EXISTS(SELECT 1 FROM test_results r WHERE r.id=test_result_id));

-- Bugs
CREATE POLICY "bug_all"    ON bugs             FOR ALL TO authenticated USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));
CREATE POLICY "bugc_all"   ON bug_comments     FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM bugs b WHERE b.id=bug_id AND is_project_member(b.project_id)));
CREATE POLICY "bugh_sel"   ON bug_history      FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM bugs b WHERE b.id=bug_id AND is_project_member(b.project_id)));

-- Attachments
CREATE POLICY "att_all"    ON attachments FOR ALL TO authenticated USING (uploaded_by=auth.uid() OR is_admin());

-- Feature Requests
CREATE POLICY "fr_all"     ON feature_requests          FOR ALL TO authenticated USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));
CREATE POLICY "frv_all"    ON feature_request_votes     FOR ALL TO authenticated
    USING (EXISTS(SELECT 1 FROM feature_requests f WHERE f.id=feature_request_id AND is_project_member(f.project_id)));
CREATE POLICY "frc_all"    ON feature_request_comments  FOR ALL TO authenticated
    USING (EXISTS(SELECT 1 FROM feature_requests f WHERE f.id=feature_request_id AND is_project_member(f.project_id)));

-- Notifications / Activity / Audit
CREATE POLICY "notif_own"  ON notifications  FOR ALL TO authenticated USING (user_id=auth.uid());
CREATE POLICY "act_sel"    ON activity_logs  FOR SELECT TO authenticated USING (project_id IS NULL OR is_project_member(project_id));
CREATE POLICY "act_ins"    ON activity_logs  FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY "audit_adm"  ON audit_logs     FOR SELECT TO authenticated USING (is_admin());

-- =======================================================
-- SEED: Default modules for demo project
-- (Run after creating first user as administrator)
-- =======================================================
-- INSERT INTO projects(name,slug,description,platform,owner_id) VALUES('RetailManager','rm','Android POS app for Indian retail','android','<your-user-id>');
