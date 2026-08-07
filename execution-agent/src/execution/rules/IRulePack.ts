// ─── IRulePack — Rule Pack Contract ──────────────────────────────────────────
// ExecutionEngine calls IRulePack.evaluate() before every step.
// Phase 3: no AI rule packs. This interface is the only contract.
// Phase 6: core and android_crash rule packs will implement this.

import type { ExecutionStep }    from '../ExecutionTypes.js';
import type { ExecutionContext } from '../ExecutionContext.js';

// ─── RuleViolation ────────────────────────────────────────────────────────────

export interface RuleViolation {
  rule_id: string;
  rule_pack_id: string;
  description: string;
  /** When true, execution of the step is blocked and the execution fails. */
  is_fatal: boolean;
}

// ─── IRulePack ────────────────────────────────────────────────────────────────

export interface IRulePack {
  readonly id: string;
  /**
   * Evaluate the rule pack against the next step to be executed.
   * Return null to allow the step to proceed.
   * Return a RuleViolation to flag it; is_fatal:true blocks and fails.
   */
  evaluate(step: ExecutionStep, ctx: ExecutionContext): Promise<RuleViolation | null>;
}
