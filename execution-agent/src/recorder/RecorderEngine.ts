// ─── RecorderEngine (Phase 4 M2) ─────────────────────────────────────────────
// Pure accumulator that converts raw action events → RecordedStep[].
//
// Rules:
// - NOT an execution engine. Does NOT call drivers. Does NOT emit events.
// - Records steps in insertion order; callers control ordering via reorder().
// - All mutation methods return the updated step list for easy testing.

import { randomUUID } from 'crypto';
import {
  RECORDER_VERSION,
  SCHEMA_VERSION,
  ANDROID_ACTIONS,
  CHROME_ACTIONS,
} from './RecorderTypes.js';
import type {
  RecordedStep,
  RecordedParams,
  RecordableDriver,
  RecordableAction,
  RecorderConfig,
} from './RecorderTypes.js';

// ─── Validation helpers ───────────────────────────────────────────────────────

function isAndroidAction(a: string): boolean {
  return (ANDROID_ACTIONS as readonly string[]).includes(a);
}

function isChromeAction(a: string): boolean {
  return (CHROME_ACTIONS as readonly string[]).includes(a);
}

function validateAction(driver: RecordableDriver, action: string): RecordableAction {
  const valid =
    (driver === 'android' && isAndroidAction(action)) ||
    (driver === 'browser' && isChromeAction(action));

  if (!valid) {
    const allowed =
      driver === 'android' ? ANDROID_ACTIONS.join(', ') : CHROME_ACTIONS.join(', ');
    throw new Error(
      `[RecorderEngine] Action '${action}' is not supported on driver '${driver}'. ` +
      `Allowed: [${allowed}]`
    );
  }

  return action as RecordableAction;
}

// ─── RecorderEngine ───────────────────────────────────────────────────────────

export class RecorderEngine {
  private readonly _config: RecorderConfig;
  private _steps: RecordedStep[] = [];

  constructor(config: RecorderConfig) {
    this._config = config;
  }

  // ── Record ─────────────────────────────────────────────────────────────────

  /**
   * Record a single action event as a RecordedStep.
   * Validates that the action is supported on the specified driver.
   * Returns the newly created step.
   */
  record(
    driver: RecordableDriver,
    action: string,
    params: RecordedParams = {},
  ): RecordedStep {
    const validAction = validateAction(driver, action);

    const step: RecordedStep = {
      id:             randomUUID(),
      schema_version: SCHEMA_VERSION,
      driver,
      action:         validAction,
      params:         { ...params },
      metadata: {
        created_by:       this._config.userId,
        created_at:       new Date().toISOString(),
        recorder_version: RECORDER_VERSION,
        source:           'recorder',
      },
    };

    this._steps.push(step);
    return step;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  /** Returns a shallow copy of the current step list. */
  getSteps(): RecordedStep[] {
    return [...this._steps];
  }

  get stepCount(): number {
    return this._steps.length;
  }

  // ── Mutate ─────────────────────────────────────────────────────────────────

  /**
   * Remove a step by id.
   * No-op if the id is not found.
   * Returns the updated step list.
   */
  removeStep(id: string): RecordedStep[] {
    this._steps = this._steps.filter(s => s.id !== id);
    return [...this._steps];
  }

  /**
   * Update the params of an existing step.
   * Throws if the step is not found.
   * Returns the updated step list.
   */
  updateParams(id: string, params: RecordedParams): RecordedStep[] {
    const idx = this._steps.findIndex(s => s.id === id);
    if (idx === -1) throw new Error(`[RecorderEngine] Step '${id}' not found`);
    this._steps[idx] = { ...this._steps[idx], params: { ...params } };
    return [...this._steps];
  }

  /**
   * Reorder steps by providing the full ordered list of ids.
   * All existing step ids must be present — throws on mismatch.
   * Returns the reordered step list.
   */
  reorder(orderedIds: string[]): RecordedStep[] {
    if (orderedIds.length !== this._steps.length) {
      throw new Error(
        `[RecorderEngine] reorder: expected ${this._steps.length} ids, got ${orderedIds.length}`
      );
    }

    const map = new Map(this._steps.map(s => [s.id, s]));

    const reordered = orderedIds.map(id => {
      const step = map.get(id);
      if (!step) throw new Error(`[RecorderEngine] reorder: unknown step id '${id}'`);
      return step;
    });

    this._steps = reordered;
    return [...this._steps];
  }

  /** Remove all recorded steps and reset state. */
  clear(): void {
    this._steps = [];
  }

  // ── Serialise ──────────────────────────────────────────────────────────────

  /**
   * Export the current steps as a plain JSON-serialisable array.
   * Safe to pass to JSON.stringify or the Supabase client.
   */
  toJSON(): RecordedStep[] {
    return this._steps.map(s => ({ ...s, params: { ...s.params }, metadata: { ...s.metadata } }));
  }
}
