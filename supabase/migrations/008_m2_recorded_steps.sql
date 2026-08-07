-- ─── Phase 4 M2: Recorded Automation Steps ───────────────────────────────────
-- Stores per-step automation configs captured by the Recorder.
-- Linked to execution_recordings via recording_id.
-- Each row is one RecordedStep (schema_version, driver, action, params, metadata).

CREATE TABLE IF NOT EXISTS recording_automation_steps (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id   UUID        NOT NULL
                               REFERENCES execution_recordings(id)
                               ON DELETE CASCADE,
  step_order     INT         NOT NULL,
  schema_version TEXT        NOT NULL DEFAULT '1.0',
  driver_id      TEXT        NOT NULL,
  action         TEXT        NOT NULL,
  params         JSONB       NOT NULL DEFAULT '{}',
  metadata       JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recording_automation_steps_order_positive CHECK (step_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_recording_automation_steps_recording_id
  ON recording_automation_steps (recording_id, step_order);

-- RLS: testers can read/write their own recording's steps.
ALTER TABLE recording_automation_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tester can manage own recording steps"
  ON recording_automation_steps
  FOR ALL
  USING (
    recording_id IN (
      SELECT id FROM execution_recordings WHERE tester_id = auth.uid()
    )
  );

CREATE POLICY "Project members can read steps"
  ON recording_automation_steps
  FOR SELECT
  USING (true);
