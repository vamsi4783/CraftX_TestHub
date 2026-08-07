// ─── ExecutionStateMachine ────────────────────────────────────────────────────
// Guards all state transitions. Illegal transitions throw immediately.
// The machine is NOT async — callers update it synchronously before/after awaits.

import type { ExecutionState } from './ExecutionTypes.js';

// ─── Transition table ─────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
  Requested:  ['Starting'],
  Starting:   ['Running', 'Failed'],
  Running:    ['Paused', 'Cancelling', 'Completed', 'Failed'],
  Paused:     ['Running', 'Cancelling'],
  Cancelling: ['Cancelled'],
  Completed:  [],
  Failed:     [],
  Cancelled:  [],
};

// ─── Errors ───────────────────────────────────────────────────────────────────

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: ExecutionState,
    public readonly to:   ExecutionState,
  ) {
    super(
      `Illegal state transition: "${from}" → "${to}". ` +
      `Valid transitions from "${from}": [${VALID_TRANSITIONS[from].join(', ') || 'none'}]`,
    );
    this.name = 'IllegalTransitionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Machine ──────────────────────────────────────────────────────────────────

export class ExecutionStateMachine {
  private _state: ExecutionState = 'Requested';
  /** Full transition history for debugging and audit. */
  readonly history: ExecutionState[] = ['Requested'];

  get state(): ExecutionState {
    return this._state;
  }

  /**
   * Attempt a transition to `to`.
   * Throws IllegalTransitionError if the transition is not allowed.
   */
  transition(to: ExecutionState): void {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed.includes(to)) {
      throw new IllegalTransitionError(this._state, to);
    }
    this._state = to;
    this.history.push(to);
  }

  is(state: ExecutionState): boolean {
    return this._state === state;
  }

  isTerminal(): boolean {
    return VALID_TRANSITIONS[this._state].length === 0;
  }
}
