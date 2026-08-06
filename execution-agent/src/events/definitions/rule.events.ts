// ─── Rule Pack Event Payload Types ───────────────────────────────────────────

export interface RulePackViolationPayload {
  rule_id: string;
  rule_pack_id: string;   // "core" | "android_crash"
  session_id: string;
  step_id: string;
  step_number: number;
  details: string;
  /** Whether the violation caused the step to fail. */
  is_fatal: boolean;
}
