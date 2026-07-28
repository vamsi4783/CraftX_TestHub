-- ============================================================
-- Migration 004: Phase 4 Analytics — Views, Indexes, RPCs
-- ============================================================

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bugs_project_created     ON bugs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bugs_project_status      ON bugs(project_id, status);
CREATE INDEX IF NOT EXISTS idx_bugs_project_severity    ON bugs(project_id, severity);
CREATE INDEX IF NOT EXISTS idx_bugs_assigned_to_status  ON bugs(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_bugs_closed_at           ON bugs(closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bugs_module_severity     ON bugs(module_id, severity);
CREATE INDEX IF NOT EXISTS idx_test_results_executed    ON test_results(executed_by, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_results_status_date ON test_results(status, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_assignments_user    ON test_assignments(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_releases_project_status  ON releases(project_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created    ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_history_changed      ON bug_history(bug_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_sessions_assigned   ON test_sessions(assigned_to, status);

-- ── Views ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_module_coverage AS
SELECT
  tc.project_id,
  COALESCE(tc.module_id::TEXT, 'unassigned') AS module_id,
  COALESCE(m.name, 'Unassigned')              AS module_name,
  COUNT(DISTINCT tc.id)                                                        AS total_cases,
  COUNT(DISTINCT ta.id)                                                        AS assigned,
  COUNT(DISTINCT CASE WHEN ta.status = 'completed'  THEN ta.id END)           AS completed,
  COUNT(DISTINCT CASE WHEN tr.status = 'pass'        THEN tr.id END)           AS passed,
  COUNT(DISTINCT CASE WHEN tr.status = 'fail'        THEN tr.id END)           AS failed,
  COUNT(DISTINCT CASE WHEN tr.status = 'blocked'     THEN tr.id END)           AS blocked
FROM test_cases tc
LEFT JOIN modules           m  ON m.id  = tc.module_id
LEFT JOIN test_assignments  ta ON ta.test_case_id = tc.id
LEFT JOIN test_results      tr ON tr.test_case_id = tc.id
WHERE tc.status = 'active'
GROUP BY tc.project_id, tc.module_id, m.name;

CREATE OR REPLACE VIEW v_tester_performance AS
SELECT
  p.id          AS user_id,
  p.full_name,
  p.avatar_url,
  COUNT(DISTINCT ta.id)                                                              AS assigned,
  COUNT(DISTINCT CASE WHEN ta.status = 'completed' THEN ta.id END)                 AS executed,
  COUNT(DISTINCT CASE WHEN tr.status = 'pass'      THEN tr.id END)                 AS passed,
  COUNT(DISTINCT CASE WHEN tr.status = 'fail'      THEN tr.id END)                 AS failed,
  COUNT(DISTINCT CASE WHEN tr.status = 'blocked'   THEN tr.id END)                 AS blocked,
  COUNT(DISTINCT CASE WHEN tr.status = 'skipped'   THEN tr.id END)                 AS skipped,
  ROUND(AVG(tr.duration_minutes)::NUMERIC, 1)                                       AS avg_duration_minutes
FROM profiles p
LEFT JOIN test_assignments ta ON ta.assigned_to = p.id
LEFT JOIN test_results     tr ON tr.executed_by  = p.id
WHERE p.is_active = TRUE
  AND p.role IN ('qa_tester', 'administrator')
GROUP BY p.id, p.full_name, p.avatar_url;

CREATE OR REPLACE VIEW v_developer_performance AS
SELECT
  p.id          AS user_id,
  p.full_name,
  p.avatar_url,
  COUNT(DISTINCT b.id)                                                                          AS assigned_bugs,
  COUNT(DISTINCT CASE WHEN b.status IN ('closed', 'verified')           THEN b.id END)         AS resolved,
  COUNT(DISTINCT CASE WHEN b.status = 'in_progress'                     THEN b.id END)         AS in_progress,
  COUNT(DISTINCT CASE WHEN b.is_regression = TRUE                        THEN b.id END)         AS reopened,
  ROUND(AVG(
    CASE WHEN b.closed_at IS NOT NULL
         THEN EXTRACT(EPOCH FROM (b.closed_at::TIMESTAMPTZ - b.created_at::TIMESTAMPTZ)) / 3600.0
    END
  )::NUMERIC, 1)                                                                                AS avg_resolution_hours
FROM profiles p
LEFT JOIN bugs b ON b.assigned_to = p.id
WHERE p.is_active = TRUE
  AND p.role IN ('developer', 'administrator')
GROUP BY p.id, p.full_name, p.avatar_url;

-- ── RPCs ───────────────────────────────────────────────────

-- Bug creation + closure trend (daily, last N days)
CREATE OR REPLACE FUNCTION get_bug_trend(p_project_id UUID, p_days INT DEFAULT 30)
RETURNS TABLE(day DATE, created BIGINT, closed BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    gs.day::DATE,
    COUNT(CASE WHEN b.project_id = p_project_id AND b.created_at::DATE = gs.day THEN 1 END) AS created,
    COUNT(CASE WHEN b.project_id = p_project_id AND b.closed_at::DATE  = gs.day THEN 1 END) AS closed
  FROM generate_series(
         CURRENT_DATE - (p_days - 1) * INTERVAL '1 day',
         CURRENT_DATE,
         INTERVAL '1 day'
       ) AS gs(day)
  LEFT JOIN bugs b
         ON b.project_id = p_project_id
        AND (b.created_at::DATE = gs.day OR b.closed_at::DATE = gs.day)
  GROUP BY gs.day
  ORDER BY gs.day;
$$;

-- Test execution trend (daily, last N days)
CREATE OR REPLACE FUNCTION get_test_execution_trend(p_project_id UUID, p_days INT DEFAULT 30)
RETURNS TABLE(day DATE, pass BIGINT, fail BIGINT, blocked BIGINT, skipped BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    gs.day::DATE,
    COUNT(CASE WHEN tr.status = 'pass'    THEN 1 END) AS pass,
    COUNT(CASE WHEN tr.status = 'fail'    THEN 1 END) AS fail,
    COUNT(CASE WHEN tr.status = 'blocked' THEN 1 END) AS blocked,
    COUNT(CASE WHEN tr.status = 'skipped' THEN 1 END) AS skipped
  FROM generate_series(
         CURRENT_DATE - (p_days - 1) * INTERVAL '1 day',
         CURRENT_DATE,
         INTERVAL '1 day'
       ) AS gs(day)
  LEFT JOIN test_results     tr ON tr.executed_at::DATE = gs.day
  LEFT JOIN test_assignments ta ON ta.id = tr.assignment_id
  LEFT JOIN releases          r ON r.id  = ta.release_id AND r.project_id = p_project_id
  GROUP BY gs.day
  ORDER BY gs.day;
$$;

-- Comprehensive dashboard stats for the current user
CREATE OR REPLACE FUNCTION get_dashboard_stats_v2(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  my_projects UUID[];
  result      JSONB;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT project_id FROM project_members WHERE user_id = p_user_id
    UNION
    SELECT id FROM projects WHERE owner_id = p_user_id
  ) INTO my_projects;

  SELECT jsonb_build_object(
    'total_projects',    (SELECT COUNT(*) FROM projects
                           WHERE id = ANY(my_projects) AND status != 'archived'),
    'active_releases',   (SELECT COUNT(*) FROM releases
                           WHERE project_id = ANY(my_projects) AND status IN ('testing','planning','ready')),
    'active_sessions',   (SELECT COUNT(*) FROM test_sessions
                           WHERE assigned_to = p_user_id AND status IN ('pending','in_progress','paused')),
    'open_bugs',         (SELECT COUNT(*) FROM bugs
                           WHERE project_id = ANY(my_projects)
                             AND status NOT IN ('closed','rejected','duplicate','wont_fix','cannot_reproduce')),
    'critical_bugs',     (SELECT COUNT(*) FROM bugs
                           WHERE project_id = ANY(my_projects)
                             AND severity = 'critical'
                             AND status NOT IN ('closed','rejected','duplicate','wont_fix')),
    'my_open_bugs',      (SELECT COUNT(*) FROM bugs
                           WHERE assigned_to = p_user_id
                             AND status NOT IN ('closed','rejected','duplicate','wont_fix','cannot_reproduce')),
    'my_retest_queue',   (SELECT COUNT(*) FROM bugs
                           WHERE retested_by = p_user_id AND status IN ('ready_for_qa','retesting')),
    'qa_pending',        (SELECT COUNT(*) FROM qa_approvals WHERE status = 'pending'),
    'assigned_tests',    (SELECT COUNT(*) FROM test_assignments
                           WHERE assigned_to = p_user_id AND status != 'completed'),
    'completed_tests',   (SELECT COUNT(*) FROM test_assignments
                           WHERE assigned_to = p_user_id AND status = 'completed'),
    'passed_tests',      (SELECT COUNT(*) FROM test_results tr
                           JOIN test_assignments ta ON ta.id = tr.assignment_id
                           WHERE ta.assigned_to = p_user_id AND tr.status = 'pass'),
    'blocked_tests',     (SELECT COUNT(*) FROM test_results tr
                           JOIN test_assignments ta ON ta.id = tr.assignment_id
                           WHERE ta.assigned_to = p_user_id AND tr.status = 'blocked')
  ) INTO result;
  RETURN result;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION get_bug_trend               TO authenticated;
GRANT EXECUTE ON FUNCTION get_test_execution_trend    TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats_v2      TO authenticated;
GRANT SELECT  ON v_module_coverage                    TO authenticated;
GRANT SELECT  ON v_tester_performance                 TO authenticated;
GRANT SELECT  ON v_developer_performance              TO authenticated;
