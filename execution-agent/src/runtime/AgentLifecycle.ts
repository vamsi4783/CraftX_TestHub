// ─── AgentLifecycle ───────────────────────────────────────────────────────────
// Mirrors ExecutionStateMachine pattern: guards transitions, throws on illegal.
// Faulted is reachable from any non-terminal state.

export type AgentState =
  | 'Created'
  | 'Starting'
  | 'Running'
  | 'Stopping'
  | 'Stopped'
  | 'Faulted';

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  Created:  ['Starting', 'Faulted'],
  Starting: ['Running',  'Faulted'],
  Running:  ['Stopping', 'Faulted'],
  Stopping: ['Stopped',  'Faulted'],
  Stopped:  [],
  Faulted:  [],
};

export class IllegalAgentTransitionError extends Error {
  constructor(
    public readonly from: AgentState,
    public readonly to:   AgentState,
  ) {
    super(
      `Illegal agent state transition: "${from}" → "${to}". ` +
      `Valid transitions from "${from}": [${VALID_TRANSITIONS[from].join(', ') || 'none'}]`,
    );
    this.name = 'IllegalAgentTransitionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AgentLifecycle {
  private _state: AgentState = 'Created';
  readonly history: AgentState[] = ['Created'];

  get state(): AgentState { return this._state; }

  transition(to: AgentState): void {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed.includes(to)) {
      throw new IllegalAgentTransitionError(this._state, to);
    }
    this._state = to;
    this.history.push(to);
  }

  is(state: AgentState): boolean { return this._state === state; }

  isTerminal(): boolean { return VALID_TRANSITIONS[this._state].length === 0; }

  isRunning(): boolean { return this._state === 'Running'; }
}
