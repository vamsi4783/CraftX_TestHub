// ─── Milestone 7: AgentLifecycle Tests ───────────────────────────────────────

import {
  AgentLifecycle,
  IllegalAgentTransitionError,
} from '../../runtime/AgentLifecycle.js';

describe('AgentLifecycle — initial state', () => {
  it('starts in Created', () => {
    expect(new AgentLifecycle().state).toBe('Created');
  });

  it('history contains Created', () => {
    expect(new AgentLifecycle().history).toEqual(['Created']);
  });

  it('is() returns true for current state', () => {
    expect(new AgentLifecycle().is('Created')).toBe(true);
  });

  it('is() returns false for other states', () => {
    expect(new AgentLifecycle().is('Running')).toBe(false);
  });

  it('isTerminal() is false initially', () => {
    expect(new AgentLifecycle().isTerminal()).toBe(false);
  });

  it('isRunning() is false initially', () => {
    expect(new AgentLifecycle().isRunning()).toBe(false);
  });
});

describe('AgentLifecycle — valid transitions', () => {
  it('Created → Starting', () => {
    const lc = new AgentLifecycle();
    lc.transition('Starting');
    expect(lc.state).toBe('Starting');
  });

  it('Starting → Running', () => {
    const lc = new AgentLifecycle();
    lc.transition('Starting');
    lc.transition('Running');
    expect(lc.state).toBe('Running');
    expect(lc.isRunning()).toBe(true);
  });

  it('Running → Stopping', () => {
    const lc = new AgentLifecycle();
    lc.transition('Starting');
    lc.transition('Running');
    lc.transition('Stopping');
    expect(lc.state).toBe('Stopping');
  });

  it('Stopping → Stopped', () => {
    const lc = new AgentLifecycle();
    lc.transition('Starting');
    lc.transition('Running');
    lc.transition('Stopping');
    lc.transition('Stopped');
    expect(lc.state).toBe('Stopped');
  });

  it('Created → Faulted', () => {
    const lc = new AgentLifecycle();
    lc.transition('Faulted');
    expect(lc.state).toBe('Faulted');
  });

  it('Starting → Faulted', () => {
    const lc = new AgentLifecycle();
    lc.transition('Starting');
    lc.transition('Faulted');
    expect(lc.state).toBe('Faulted');
  });

  it('Running → Faulted', () => {
    const lc = new AgentLifecycle();
    lc.transition('Starting');
    lc.transition('Running');
    lc.transition('Faulted');
    expect(lc.state).toBe('Faulted');
  });

  it('Stopping → Faulted', () => {
    const lc = new AgentLifecycle();
    lc.transition('Starting');
    lc.transition('Running');
    lc.transition('Stopping');
    lc.transition('Faulted');
    expect(lc.state).toBe('Faulted');
  });
});

describe('AgentLifecycle — illegal transitions', () => {
  it('throws IllegalAgentTransitionError on Created → Running', () => {
    const lc = new AgentLifecycle();
    expect(() => lc.transition('Running')).toThrow(IllegalAgentTransitionError);
  });

  it('throws on Created → Stopped', () => {
    const lc = new AgentLifecycle();
    expect(() => lc.transition('Stopped')).toThrow(IllegalAgentTransitionError);
  });

  it('throws on Running → Starting', () => {
    const lc = new AgentLifecycle();
    lc.transition('Starting');
    lc.transition('Running');
    expect(() => lc.transition('Starting')).toThrow(IllegalAgentTransitionError);
  });

  it('throws on Stopped → Running (terminal)', () => {
    const lc = new AgentLifecycle();
    lc.transition('Starting');
    lc.transition('Running');
    lc.transition('Stopping');
    lc.transition('Stopped');
    expect(() => lc.transition('Running')).toThrow(IllegalAgentTransitionError);
  });

  it('throws on Faulted → Running (terminal)', () => {
    const lc = new AgentLifecycle();
    lc.transition('Faulted');
    expect(() => lc.transition('Running')).toThrow(IllegalAgentTransitionError);
  });

  it('error message contains from and to states', () => {
    const lc = new AgentLifecycle();
    try {
      lc.transition('Stopped');
    } catch (err) {
      expect(String(err)).toContain('Created');
      expect(String(err)).toContain('Stopped');
    }
  });
});

describe('AgentLifecycle — terminal states', () => {
  it('Stopped is terminal', () => {
    const lc = new AgentLifecycle();
    lc.transition('Starting');
    lc.transition('Running');
    lc.transition('Stopping');
    lc.transition('Stopped');
    expect(lc.isTerminal()).toBe(true);
  });

  it('Faulted is terminal', () => {
    const lc = new AgentLifecycle();
    lc.transition('Faulted');
    expect(lc.isTerminal()).toBe(true);
  });
});

describe('AgentLifecycle — history', () => {
  it('records full transition history', () => {
    const lc = new AgentLifecycle();
    lc.transition('Starting');
    lc.transition('Running');
    lc.transition('Stopping');
    lc.transition('Stopped');
    expect(lc.history).toEqual(['Created', 'Starting', 'Running', 'Stopping', 'Stopped']);
  });
});
