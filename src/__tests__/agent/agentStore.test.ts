// ─── M9: agentStore unit tests ────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentStore } from '../../features/agent/agentStore';

function reset() {
  useAgentStore.setState({
    connectionState:  'Disconnected',
    agentState:       'Stopped',
    agentId:          'agent-ui-preview',
    agentVersion:     '1.0.0',
    protocolVersion:  '1.0',
    heartbeatSeq:     0,
    lastHeartbeatAt:  null,
    health:           null,
    devices:          [],
    diagnostics:      null,
    evidenceItems:    [],
    events:           [],
  });
}

describe('agentStore — connection state', () => {
  beforeEach(reset);

  it('starts Disconnected', () => {
    expect(useAgentStore.getState().connectionState).toBe('Disconnected');
  });

  it('setConnectionState updates the state', () => {
    useAgentStore.getState().setConnectionState('Connected');
    expect(useAgentStore.getState().connectionState).toBe('Connected');
  });

  it('setAgentState updates the agent state', () => {
    useAgentStore.getState().setAgentState('Running');
    expect(useAgentStore.getState().agentState).toBe('Running');
  });
});

describe('agentStore — heartbeat', () => {
  beforeEach(reset);

  it('receiveHeartbeat sets seq and lastHeartbeatAt', () => {
    useAgentStore.getState().receiveHeartbeat(42);
    const { heartbeatSeq, lastHeartbeatAt } = useAgentStore.getState();
    expect(heartbeatSeq).toBe(42);
    expect(lastHeartbeatAt).not.toBeNull();
  });
});

describe('agentStore — events', () => {
  beforeEach(reset);

  it('pushEvent prepends to events', () => {
    const e = { id: '1', timestamp: new Date().toISOString(), eventType: 'StepCompleted', payload: {} };
    useAgentStore.getState().pushEvent(e);
    expect(useAgentStore.getState().events[0].id).toBe('1');
  });

  it('clearEvents empties the list', () => {
    useAgentStore.getState().pushEvent({ id: 'x', timestamp: '', eventType: 'T', payload: {} });
    useAgentStore.getState().clearEvents();
    expect(useAgentStore.getState().events).toHaveLength(0);
  });

  it('events are capped at 200', () => {
    for (let i = 0; i < 250; i++) {
      useAgentStore.getState().pushEvent({ id: String(i), timestamp: '', eventType: 'T', payload: {} });
    }
    expect(useAgentStore.getState().events.length).toBeLessThanOrEqual(200);
  });
});

describe('agentStore — evidence', () => {
  beforeEach(reset);

  it('upsertEvidence adds new items', () => {
    useAgentStore.getState().upsertEvidence({
      evidenceId: 'ev-1', label: 'screenshot', mimeType: 'image/png',
      status: 'pending', retryCount: 0, capturedAt: '',
    });
    expect(useAgentStore.getState().evidenceItems).toHaveLength(1);
  });

  it('upsertEvidence updates existing item by evidenceId', () => {
    const item = { evidenceId: 'ev-1', label: 'log', mimeType: 'text/plain', status: 'pending' as const, retryCount: 0, capturedAt: '' };
    useAgentStore.getState().upsertEvidence(item);
    useAgentStore.getState().upsertEvidence({ ...item, status: 'uploaded' });
    const items = useAgentStore.getState().evidenceItems;
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('uploaded');
  });
});

describe('agentStore — settings', () => {
  beforeEach(reset);

  it('updateSettings merges patch', () => {
    useAgentStore.getState().updateSettings({ heartbeatIntervalMs: 9999 });
    expect(useAgentStore.getState().settings.heartbeatIntervalMs).toBe(9999);
  });

  it('default serverUrl is ws://localhost:8080', () => {
    expect(useAgentStore.getState().settings.serverUrl).toBe('ws://localhost:8080');
  });
});

describe('agentStore — commands', () => {
  beforeEach(reset);

  it('executeTest when disconnected pushes ExecuteTest_NotConnected event', () => {
    useAgentStore.getState().executeTest('sess-1', 'tc-1', 'android_adb', []);
    const events = useAgentStore.getState().events;
    expect(events.some(e => e.eventType === 'ExecuteTest_NotConnected')).toBe(true);
  });

  it('cancelExecution does not throw when disconnected', () => {
    expect(() => useAgentStore.getState().cancelExecution('sess-1')).not.toThrow();
  });

  it('refreshDiagnostics sets diagnostics snapshot', async () => {
    await useAgentStore.getState().refreshDiagnostics();
    expect(useAgentStore.getState().diagnostics).not.toBeNull();
  });

  it('refreshDiagnostics includes serverUrl from settings', async () => {
    useAgentStore.getState().updateSettings({ serverUrl: 'ws://example.com:8080' });
    await useAgentStore.getState().refreshDiagnostics();
    expect(useAgentStore.getState().diagnostics?.serverUrl).toBe('ws://example.com:8080');
  });
});
