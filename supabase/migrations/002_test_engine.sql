-- ============================================================
-- Phase 2: Test Management & Execution Engine
-- ============================================================

-- Test Plans: group test cases for a release
CREATE TABLE IF NOT EXISTS test_plans (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    release_id   UUID REFERENCES releases(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    status       TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','active','completed','archived')),
    created_by   UUID NOT NULL REFERENCES profiles(id),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Test Plan Cases: which test cases belong to a plan
CREATE TABLE IF NOT EXISTS test_plan_cases (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id      UUID NOT NULL REFERENCES test_plans(id) ON DELETE CASCADE,
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    order_index  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (plan_id, test_case_id)
);

-- Test Sessions: execution sessions assigned to a tester
CREATE TABLE IF NOT EXISTS test_sessions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id      UUID REFERENCES test_plans(id) ON DELETE SET NULL,
    project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    release_id   UUID REFERENCES releases(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    assigned_to  UUID NOT NULL REFERENCES profiles(id),
    assigned_by  UUID NOT NULL REFERENCES profiles(id),
    start_date   DATE,
    end_date     DATE,
    status       TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','in_progress','paused','completed','cancelled')),
    progress_pct INTEGER DEFAULT 0,
    total_cases  INTEGER DEFAULT 0,
    passed_cases INTEGER DEFAULT 0,
    failed_cases INTEGER DEFAULT 0,
    blocked_cases INTEGER DEFAULT 0,
    skipped_cases INTEGER DEFAULT 0,
    current_case_id UUID REFERENCES test_cases(id) ON DELETE SET NULL,
    current_step_index INTEGER DEFAULT 0,
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Test Session Cases: which test cases are in a session (ordered)
CREATE TABLE IF NOT EXISTS test_session_cases (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id   UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    order_index  INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','in_progress','pass','fail','blocked','skipped','not_tested')),
    execution_id UUID,  -- FK added below after test_executions created
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Test Executions: one per test case run (replaces test_results for sessions)
CREATE TABLE IF NOT EXISTS test_executions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
    session_case_id UUID REFERENCES test_session_cases(id) ON DELETE SET NULL,
    test_case_id    UUID NOT NULL REFERENCES test_cases(id),
    project_id      UUID NOT NULL REFERENCES projects(id),
    release_id      UUID REFERENCES releases(id),
    executed_by     UUID NOT NULL REFERENCES profiles(id),
    status          TEXT NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress','pass','fail','blocked','skipped','not_tested','abandoned')),
    overall_status  TEXT,
    notes           TEXT,
    environment     TEXT DEFAULT 'QA',
    device_info     TEXT,
    app_version     TEXT,
    build_number    TEXT,
    duration_seconds INTEGER DEFAULT 0,
    step_snapshot   JSONB,  -- snapshot of steps at execution time
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK back-reference
ALTER TABLE test_session_cases
    ADD CONSTRAINT fk_session_case_execution
    FOREIGN KEY (execution_id) REFERENCES test_executions(id) ON DELETE SET NULL;

-- Execution Step Results: per-step pass/fail with evidence
CREATE TABLE IF NOT EXISTS execution_step_results (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id    UUID NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
    step_id         UUID REFERENCES test_case_steps(id) ON DELETE SET NULL,
    step_number     INTEGER NOT NULL,
    step_description TEXT,
    expected_result TEXT,
    status          TEXT NOT NULL DEFAULT 'not_tested'
                        CHECK (status IN ('pass','fail','blocked','skipped','not_tested')),
    actual_result   TEXT,
    notes           TEXT,
    bug_id          UUID REFERENCES bugs(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Execution Attachments: evidence files (screenshots, logs, etc)
CREATE TABLE IF NOT EXISTS execution_attachments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id    UUID NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
    step_result_id  UUID REFERENCES execution_step_results(id) ON DELETE SET NULL,
    file_name       TEXT NOT NULL,
    file_url        TEXT NOT NULL,
    file_type       TEXT NOT NULL,
    file_size       INTEGER,
    uploaded_by     UUID NOT NULL REFERENCES profiles(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_test_plans_project ON test_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_test_plans_release ON test_plans(release_id);
CREATE INDEX IF NOT EXISTS idx_test_sessions_project ON test_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_test_sessions_release ON test_sessions(release_id);
CREATE INDEX IF NOT EXISTS idx_test_sessions_assignee ON test_sessions(assigned_to);
CREATE INDEX IF NOT EXISTS idx_test_sessions_status ON test_sessions(status);
CREATE INDEX IF NOT EXISTS idx_session_cases_session ON test_session_cases(session_id);
CREATE INDEX IF NOT EXISTS idx_test_executions_session ON test_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_test_executions_case ON test_executions(test_case_id);
CREATE INDEX IF NOT EXISTS idx_test_executions_executor ON test_executions(executed_by);
CREATE INDEX IF NOT EXISTS idx_exec_steps_execution ON execution_step_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_exec_attachments_execution ON execution_attachments(execution_id);

-- ============================================================
-- Updated_at triggers
-- ============================================================
CREATE TRIGGER set_updated_at_test_plans
    BEFORE UPDATE ON test_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_test_sessions
    BEFORE UPDATE ON test_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_test_executions
    BEFORE UPDATE ON test_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_exec_steps
    BEFORE UPDATE ON execution_step_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Auto-update session progress when execution_step_results changes
-- ============================================================
CREATE OR REPLACE FUNCTION update_session_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_session_id UUID;
    v_total INTEGER;
    v_pass INTEGER;
    v_fail INTEGER;
    v_blocked INTEGER;
    v_skipped INTEGER;
    v_done INTEGER;
    v_pct INTEGER;
BEGIN
    SELECT session_id INTO v_session_id
    FROM test_executions WHERE id = NEW.execution_id;

    IF v_session_id IS NULL THEN RETURN NEW; END IF;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'pass'),
        COUNT(*) FILTER (WHERE status = 'fail'),
        COUNT(*) FILTER (WHERE status = 'blocked'),
        COUNT(*) FILTER (WHERE status = 'skipped')
    INTO v_total, v_pass, v_fail, v_blocked, v_skipped
    FROM test_session_cases WHERE session_id = v_session_id;

    v_done := v_pass + v_fail + v_blocked + v_skipped;
    v_pct := CASE WHEN v_total > 0 THEN (v_done * 100 / v_total) ELSE 0 END;

    UPDATE test_sessions SET
        total_cases = v_total, passed_cases = v_pass, failed_cases = v_fail,
        blocked_cases = v_blocked, skipped_cases = v_skipped, progress_pct = v_pct
    WHERE id = v_session_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_session_progress
    AFTER UPDATE ON test_session_cases FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION update_session_progress();

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE test_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_plan_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_session_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_step_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_attachments ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read; writes controlled per role
CREATE POLICY "auth_read_test_plans" ON test_plans FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write_test_plans" ON test_plans FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_sessions" ON test_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write_sessions" ON test_sessions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_session_cases" ON test_session_cases FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write_session_cases" ON test_session_cases FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_plan_cases" ON test_plan_cases FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write_plan_cases" ON test_plan_cases FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_executions" ON test_executions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write_executions" ON test_executions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_exec_steps" ON execution_step_results FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write_exec_steps" ON execution_step_results FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_exec_attach" ON execution_attachments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write_exec_attach" ON execution_attachments FOR ALL USING (auth.role() = 'authenticated');
