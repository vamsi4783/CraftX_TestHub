-- ─────────────────────────────────────────────────────────────────────────────
-- TestHub Phase 4 · Milestone 1 — Automation Configuration
-- Migration: 007_m1_automation_config.sql
-- Project:   TestHub (sdrlluwezrigaxkpfnjb)
--
-- Adds automation_config JSONB column to test_case_steps.
--
-- Schema:
--   {
--     "driver_id": "android" | "browser",
--     "action":    "tap" | "swipe" | "type_text" | "wait" | "launch_app"
--               | "assertion" | "screenshot" | "press_back" | "press_key",
--     "params": {
--       -- tap / assertion / screenshot
--       "x": number,
--       "y": number,
--       -- swipe
--       "x2": number,
--       "y2": number,
--       "duration_ms": number,
--       -- type_text / launch_app
--       "value": string,
--       -- wait
--       "duration_ms": number,
--       -- assertion
--       "assertion_type": "text_present" | "element_visible" | "package"
--                       | "activity" | "screenshot",
--       "expected_value": string,
--       -- press_key
--       "key": string,
--       -- shared
--       "timeout_ms": number
--     }
--   }
--
-- Note: migration 006 incorrectly targeted 'test_steps' (RetailManager table).
--       This migration targets the correct TestHub table: test_case_steps.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE test_case_steps
  ADD COLUMN IF NOT EXISTS automation_config JSONB;

COMMENT ON COLUMN test_case_steps.automation_config IS
  'Per-step automation configuration (AutomationConfig). '
  'Populated via the Step Automation Editor UI in Phase 4. '
  'Schema: { driver_id, action, params: { x?, y?, x2?, y2?, value?, duration_ms?, '
  'assertion_type?, expected_value?, key?, timeout_ms? } }';
