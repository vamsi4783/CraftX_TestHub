// ─── Android Crash Rule Pack (stub — implemented Milestone 6) ────────────────

export const ANDROID_CRASH_RULE_PACK_ID = 'android_crash';

export const androidCrashRules = {
  CRASH_DETECTED: 'android_crash.crash_detected',
  ANR_DETECTED:   'android_crash.anr_detected',
} as const;
