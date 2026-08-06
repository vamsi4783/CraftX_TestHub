// ─── Validation Result ────────────────────────────────────────────────────────
// Discriminated union returned by all validate() calls in the engine.
// Never throws — callers check .ok and decide how to react.

export interface ValidationError {
  field: string;
  message: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationError[] };

export function validOk(): ValidationResult {
  return { ok: true };
}

export function validFail(errors: ValidationError[]): ValidationResult {
  return { ok: false, errors };
}

export function validFailField(field: string, message: string): ValidationResult {
  return { ok: false, errors: [{ field, message }] };
}
