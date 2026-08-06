// ─── Envelope Validator ───────────────────────────────────────────────────────
// Validates the structural correctness of EventEnvelope and CommandEnvelope.
// Validates only the envelope fields — payload validation is the registry's job.
// All methods are static; no state.

import { validOk, validFail } from './ValidationResult.js';
import type { ValidationResult, ValidationError } from './ValidationResult.js';

// UUID v4 / v7 — both 8-4-4-4-12 hex groups
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ISO8601 with mandatory Z suffix — fractional seconds optional
const ISO8601Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
// PascalCase identifier — must start uppercase, may include digits, min 2 chars
const PASCAL_RE = /^[A-Z][A-Za-z0-9]+$/;

function nonEmpty(v: unknown, field: string, errors: ValidationError[]): void {
  if (typeof v !== 'string' || v.trim() === '') {
    errors.push({ field, message: 'Must be a non-empty string' });
  }
}

export class EnvelopeValidator {
  /** Validate an EventEnvelope. Accepts unknown — safe for deserialized JSON. */
  static validateEvent(envelope: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (typeof envelope !== 'object' || envelope === null) {
      return validFail([{ field: 'envelope', message: 'Must be a non-null object' }]);
    }

    const e = envelope as Record<string, unknown>;

    if (typeof e['event_id'] !== 'string' || !UUID_RE.test(e['event_id'])) {
      errors.push({ field: 'event_id', message: 'Must be a valid UUID (v4 or v7)' });
    }

    if (typeof e['event_type'] !== 'string' || !PASCAL_RE.test(e['event_type'])) {
      errors.push({
        field: 'event_type',
        message: 'Must be PascalCase with ≥2 chars (e.g. StepCompleted)',
      });
    }

    if (
      typeof e['schema_version'] !== 'number' ||
      !Number.isInteger(e['schema_version']) ||
      e['schema_version'] < 1
    ) {
      errors.push({ field: 'schema_version', message: 'Must be a positive integer (≥ 1)' });
    }

    nonEmpty(e['correlation_id'], 'correlation_id', errors);
    nonEmpty(e['causation_id'],   'causation_id',   errors);
    nonEmpty(e['org_id'],         'org_id',         errors);
    nonEmpty(e['agent_id'],       'agent_id',       errors);

    if (typeof e['occurred_at'] !== 'string' || !ISO8601Z_RE.test(e['occurred_at'])) {
      errors.push({
        field: 'occurred_at',
        message: 'Must be ISO8601 UTC (e.g. 2026-08-06T12:00:00Z)',
      });
    }

    if (
      typeof e['sequence'] !== 'number' ||
      !Number.isInteger(e['sequence']) ||
      e['sequence'] < 1
    ) {
      errors.push({ field: 'sequence', message: 'Must be a positive integer (≥ 1)' });
    }

    if (e['payload'] === undefined || e['payload'] === null) {
      errors.push({ field: 'payload', message: 'Must be present (use {} for empty payload)' });
    }

    return errors.length === 0 ? validOk() : validFail(errors);
  }

  /** Validate a CommandEnvelope. Accepts unknown — safe for deserialized JSON. */
  static validateCommand(envelope: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (typeof envelope !== 'object' || envelope === null) {
      return validFail([{ field: 'envelope', message: 'Must be a non-null object' }]);
    }

    const e = envelope as Record<string, unknown>;

    if (typeof e['command_id'] !== 'string' || !UUID_RE.test(e['command_id'])) {
      errors.push({ field: 'command_id', message: 'Must be a valid UUID' });
    }

    if (typeof e['command_type'] !== 'string' || !PASCAL_RE.test(e['command_type'])) {
      errors.push({
        field: 'command_type',
        message: 'Must be PascalCase with ≥2 chars (e.g. RunSession)',
      });
    }

    nonEmpty(e['correlation_id'], 'correlation_id', errors);
    nonEmpty(e['org_id'],         'org_id',         errors);

    if (typeof e['issued_at'] !== 'string' || !ISO8601Z_RE.test(e['issued_at'])) {
      errors.push({
        field: 'issued_at',
        message: 'Must be ISO8601 UTC (e.g. 2026-08-06T12:00:00Z)',
      });
    }

    if (e['payload'] === undefined || e['payload'] === null) {
      errors.push({ field: 'payload', message: 'Must be present (use {} for empty payload)' });
    }

    return errors.length === 0 ? validOk() : validFail(errors);
  }
}
