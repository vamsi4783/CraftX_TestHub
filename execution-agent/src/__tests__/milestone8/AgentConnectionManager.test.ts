// ─── Milestone 8: AgentConnectionManager Tests ───────────────────────────────

import {
  AgentConnectionManager,
  IllegalConnectionTransitionError,
}                         from '../../communication/AgentConnectionManager.js';
import type { ReconnectPolicy } from '../../communication/ReconnectStrategy.js';

const noRetryPolicy: ReconnectPolicy = {
  maxAttempts: 0, initialDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0,
};

const threeAttemptPolicy: ReconnectPolicy = {
  maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2, maxDelayMs: 10000,
};

// ─── Initial state ────────────────────────────────────────────────────────────

describe('AgentConnectionManager — initial state', () => {
  it('starts Disconnected', () => {
    expect(new AgentConnectionManager().state).toBe('Disconnected');
  });

  it('history contains Disconnected', () => {
    expect(new AgentConnectionManager().history).toEqual(['Disconnected']);
  });

  it('reconnectAttempts is 0', () => {
    expect(new AgentConnectionManager().reconnectAttempts).toBe(0);
  });

  it('connectedAt is null', () => {
    expect(new AgentConnectionManager().connectedAt).toBeNull();
  });
});

// ─── Connect ──────────────────────────────────────────────────────────────────

describe('AgentConnectionManager — connect flow', () => {
  it('Disconnected → Connecting via startConnecting()', () => {
    const mgr = new AgentConnectionManager();
    mgr.startConnecting();
    expect(mgr.state).toBe('Connecting');
  });

  it('Connecting → Connected via markConnected()', () => {
    const mgr = new AgentConnectionManager();
    mgr.startConnecting();
    mgr.markConnected();
    expect(mgr.state).toBe('Connected');
  });

  it('connectedAt is set after markConnected()', () => {
    const mgr = new AgentConnectionManager();
    mgr.startConnecting();
    mgr.markConnected();
    expect(mgr.connectedAt).not.toBeNull();
  });

  it('reconnectAttempts resets to 0 after markConnected()', () => {
    const mgr = new AgentConnectionManager(threeAttemptPolicy);
    mgr.startConnecting();
    mgr.markConnected();
    mgr.onConnectionLost(); // attempt 1
    expect(mgr.reconnectAttempts).toBe(1);
    mgr.startConnecting();
    mgr.markConnected();
    expect(mgr.reconnectAttempts).toBe(0);
  });

  it('onConnected callback fires on markConnected()', () => {
    const calls: string[] = [];
    const mgr = new AgentConnectionManager(threeAttemptPolicy, {
      onConnected: () => { calls.push('connected'); },
    });
    mgr.startConnecting();
    mgr.markConnected();
    expect(calls).toContain('connected');
  });
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

describe('AgentConnectionManager — disconnect', () => {
  it('Connected → Disconnected via markDisconnected()', () => {
    const mgr = new AgentConnectionManager();
    mgr.startConnecting();
    mgr.markConnected();
    mgr.markDisconnected();
    expect(mgr.state).toBe('Disconnected');
  });

  it('onDisconnected callback fires on markDisconnected()', () => {
    const calls: string[] = [];
    const mgr = new AgentConnectionManager(threeAttemptPolicy, {
      onDisconnected: () => { calls.push('disconnected'); },
    });
    mgr.startConnecting();
    mgr.markConnected();
    mgr.markDisconnected();
    expect(calls).toContain('disconnected');
  });
});

// ─── Authentication failure ────────────────────────────────────────────────────

describe('AgentConnectionManager — auth failure', () => {
  it('Connecting → AuthenticationFailed via markAuthFailed()', () => {
    const mgr = new AgentConnectionManager();
    mgr.startConnecting();
    mgr.markAuthFailed('bad token');
    expect(mgr.state).toBe('AuthenticationFailed');
  });

  it('onAuthFailed callback fires with reason', () => {
    const reasons: string[] = [];
    const mgr = new AgentConnectionManager(threeAttemptPolicy, {
      onAuthFailed: (r) => { reasons.push(r); },
    });
    mgr.startConnecting();
    mgr.markAuthFailed('expired token');
    expect(reasons).toContain('expired token');
  });

  it('AuthenticationFailed → Disconnected is valid', () => {
    const mgr = new AgentConnectionManager();
    mgr.startConnecting();
    mgr.markAuthFailed('x');
    mgr.markDisconnected();
    expect(mgr.state).toBe('Disconnected');
  });
});

// ─── Reconnect ────────────────────────────────────────────────────────────────

describe('AgentConnectionManager — reconnect', () => {
  it('onConnectionLost() → Reconnecting when attempts remain', () => {
    const mgr = new AgentConnectionManager(threeAttemptPolicy);
    mgr.startConnecting();
    mgr.markConnected();
    mgr.onConnectionLost();
    expect(mgr.state).toBe('Reconnecting');
  });

  it('reconnectAttempts increments on each onConnectionLost()', () => {
    const mgr = new AgentConnectionManager(threeAttemptPolicy);
    mgr.startConnecting();
    mgr.markConnected();
    mgr.onConnectionLost();
    expect(mgr.reconnectAttempts).toBe(1);
    mgr.startConnecting();
    mgr.markConnected();
    mgr.onConnectionLost();
    expect(mgr.reconnectAttempts).toBe(1); // reset by markConnected
  });

  it('onReconnecting callback fires with attempt and delay', () => {
    const events: Array<{ attempt: number; delay: number }> = [];
    const mgr = new AgentConnectionManager(threeAttemptPolicy, {
      onReconnecting: (attempt, delay) => { events.push({ attempt, delay }); },
    });
    mgr.startConnecting();
    mgr.markConnected();
    mgr.onConnectionLost();
    expect(events).toHaveLength(1);
    expect(events[0].attempt).toBe(1);
    expect(events[0].delay).toBe(500);
  });

  it('onConnectionLost() → Disconnected when maxAttempts exhausted', () => {
    const mgr = new AgentConnectionManager(noRetryPolicy);
    mgr.startConnecting();
    mgr.markConnected();
    mgr.onConnectionLost();
    expect(mgr.state).toBe('Disconnected');
  });

  it('reconnect decision delayMs increases with backoff', () => {
    const mgr = new AgentConnectionManager(threeAttemptPolicy);
    mgr.startConnecting();
    mgr.markConnected();
    const d1 = mgr.onConnectionLost(); // attempt 1: 500ms
    mgr.startConnecting();
    // simulate another loss without marking connected (attempt resets on connect only)
    const d2 = mgr.onConnectionLost(); // attempt 2: 1000ms
    expect(d2.delayMs).toBeGreaterThan(d1.delayMs);
  });
});

// ─── Illegal transitions ──────────────────────────────────────────────────────

describe('AgentConnectionManager — illegal transitions', () => {
  it('throws on Disconnected → Connected directly', () => {
    const mgr = new AgentConnectionManager();
    expect(() => mgr.markConnected()).toThrow(IllegalConnectionTransitionError);
  });

  it('throws on Connected → Connecting', () => {
    const mgr = new AgentConnectionManager();
    mgr.startConnecting();
    mgr.markConnected();
    expect(() => mgr.startConnecting()).toThrow(IllegalConnectionTransitionError);
  });
});

// ─── History ──────────────────────────────────────────────────────────────────

describe('AgentConnectionManager — history', () => {
  it('records full transition history', () => {
    const mgr = new AgentConnectionManager(threeAttemptPolicy);
    mgr.startConnecting();
    mgr.markConnected();
    mgr.onConnectionLost();
    mgr.startConnecting();
    mgr.markConnected();
    expect(mgr.history).toEqual([
      'Disconnected', 'Connecting', 'Connected', 'Reconnecting', 'Connecting', 'Connected',
    ]);
  });
});

// ─── Diagnostics integration ──────────────────────────────────────────────────

describe('AgentConnectionManager — diagnostics', () => {
  it('is() returns true for current state', () => {
    const mgr = new AgentConnectionManager();
    expect(mgr.is('Disconnected')).toBe(true);
  });
});
