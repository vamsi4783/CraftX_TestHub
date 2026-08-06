// ─── Core Rule Pack (stub — implemented Milestone 6) ─────────────────────────

export const CORE_RULE_PACK_ID = 'core';

export const coreRules = {
  STEP_TIMEOUT:       'core.step_timeout',
  ELEMENT_NOT_FOUND:  'core.element_not_found',
  ASSERTION_FAILURE:  'core.assertion_failure',
} as const;
