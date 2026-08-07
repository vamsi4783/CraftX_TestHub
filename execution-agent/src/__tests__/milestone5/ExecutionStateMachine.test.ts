// ─── Milestone 5: ExecutionStateMachine Tests ────────────────────────────────

import { ExecutionStateMachine,
         IllegalTransitionError }  from '../../execution/ExecutionStateMachine.js';
import type { ExecutionState }     from '../../execution/ExecutionTypes.js';

// ─── Initial state ────────────────────────────────────────────────────────────

describe('ExecutionStateMachine — initial state', () => {
  it('starts in Requested state', () => {
    expect(new ExecutionStateMachine().state).toBe('Requested');
  });

  it('history starts with [Requested]', () => {
    expect(new ExecutionStateMachine().history).toEqual(['Requested']);
  });

  it('isTerminal() is false in Requested', () => {
    expect(new ExecutionStateMachine().isTerminal()).toBe(false);
  });
});

// ─── Valid transitions ────────────────────────────────────────────────────────

describe('ExecutionStateMachine — valid transitions', () => {
  it('Requested → Starting', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting');
    expect(m.state).toBe('Starting');
  });

  it('Starting → Running', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting');
    m.transition('Running');
    expect(m.state).toBe('Running');
  });

  it('Starting → Failed', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting');
    m.transition('Failed');
    expect(m.state).toBe('Failed');
  });

  it('Running → Completed', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting'); m.transition('Running');
    m.transition('Completed');
    expect(m.state).toBe('Completed');
  });

  it('Running → Failed', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting'); m.transition('Running');
    m.transition('Failed');
    expect(m.state).toBe('Failed');
  });

  it('Running → Paused', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting'); m.transition('Running');
    m.transition('Paused');
    expect(m.state).toBe('Paused');
  });

  it('Running → Cancelling → Cancelled', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting'); m.transition('Running');
    m.transition('Cancelling');
    m.transition('Cancelled');
    expect(m.state).toBe('Cancelled');
  });

  it('Paused → Running', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting'); m.transition('Running');
    m.transition('Paused'); m.transition('Running');
    expect(m.state).toBe('Running');
  });

  it('Paused → Cancelling → Cancelled', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting'); m.transition('Running');
    m.transition('Paused'); m.transition('Cancelling');
    m.transition('Cancelled');
    expect(m.state).toBe('Cancelled');
  });
});

// ─── Illegal transitions ──────────────────────────────────────────────────────

describe('ExecutionStateMachine — illegal transitions throw IllegalTransitionError', () => {
  function attempt(from: ExecutionState[], to: ExecutionState) {
    const m = new ExecutionStateMachine();
    for (const s of from) m.transition(s);
    return () => m.transition(to);
  }

  it('Requested → Running (skips Starting)', () => {
    expect(attempt([], 'Running')).toThrow(IllegalTransitionError);
  });

  it('Requested → Completed', () => {
    expect(attempt([], 'Completed')).toThrow(IllegalTransitionError);
  });

  it('Starting → Cancelled (no Cancelling step)', () => {
    expect(attempt(['Starting'], 'Cancelled')).toThrow(IllegalTransitionError);
  });

  it('Running → Requested (backwards)', () => {
    expect(attempt(['Starting', 'Running'], 'Requested')).toThrow(IllegalTransitionError);
  });

  it('Running → Starting (backwards)', () => {
    expect(attempt(['Starting', 'Running'], 'Starting')).toThrow(IllegalTransitionError);
  });

  it('Completed → Running (from terminal)', () => {
    expect(attempt(['Starting', 'Running', 'Completed'], 'Running'))
      .toThrow(IllegalTransitionError);
  });

  it('Completed → Failed (from terminal)', () => {
    expect(attempt(['Starting', 'Running', 'Completed'], 'Failed'))
      .toThrow(IllegalTransitionError);
  });

  it('Failed → Completed (from terminal)', () => {
    expect(attempt(['Starting', 'Failed'], 'Completed'))
      .toThrow(IllegalTransitionError);
  });

  it('Cancelled → Running (from terminal)', () => {
    expect(attempt(['Starting', 'Running', 'Cancelling', 'Cancelled'], 'Running'))
      .toThrow(IllegalTransitionError);
  });

  it('Cancelling → Completed (must go through Cancelled)', () => {
    expect(attempt(['Starting', 'Running', 'Cancelling'], 'Completed'))
      .toThrow(IllegalTransitionError);
  });
});

// ─── IllegalTransitionError ───────────────────────────────────────────────────

describe('IllegalTransitionError', () => {
  it('is an instance of Error', () => {
    expect(new IllegalTransitionError('Running', 'Requested')).toBeInstanceOf(Error);
  });

  it('message contains from and to states', () => {
    const err = new IllegalTransitionError('Running', 'Requested');
    expect(err.message).toContain('Running');
    expect(err.message).toContain('Requested');
  });

  it('exposes from and to properties', () => {
    const err = new IllegalTransitionError('Running', 'Requested');
    expect(err.from).toBe('Running');
    expect(err.to).toBe('Requested');
  });
});

// ─── History and helpers ──────────────────────────────────────────────────────

describe('ExecutionStateMachine — history and helpers', () => {
  it('history records every transition', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting'); m.transition('Running'); m.transition('Completed');
    expect(m.history).toEqual(['Requested', 'Starting', 'Running', 'Completed']);
  });

  it('is() returns true for current state', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting');
    expect(m.is('Starting')).toBe(true);
    expect(m.is('Running')).toBe(false);
  });

  it('isTerminal() is true for Completed', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting'); m.transition('Running'); m.transition('Completed');
    expect(m.isTerminal()).toBe(true);
  });

  it('isTerminal() is true for Failed', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting'); m.transition('Failed');
    expect(m.isTerminal()).toBe(true);
  });

  it('isTerminal() is true for Cancelled', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting'); m.transition('Running');
    m.transition('Cancelling'); m.transition('Cancelled');
    expect(m.isTerminal()).toBe(true);
  });

  it('isTerminal() is false for Running', () => {
    const m = new ExecutionStateMachine();
    m.transition('Starting'); m.transition('Running');
    expect(m.isTerminal()).toBe(false);
  });
});
