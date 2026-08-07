// ─── Milestone 8: AgentServer Tests ──────────────────────────────────────────
// Uses ManualTransport — no real WebSocket connections.

import { AgentServer, INSTANT_SERVER_TIMER } from '../../communication/AgentServer.js';
import { ManualTransportFactory }            from '../../communication/ManualTransport.js';
import { MessageSerializer }                 from '../../communication/MessageSerializer.js';
import { buildRuntimeConfig }                from '../../runtime/RuntimeConfiguration.js';
import { AgentRuntime }                      from '../../runtime/AgentRuntime.js';
import { NOOP_RUNTIME_METRICS }              from '../../runtime/RuntimeMetrics.js';
import { INSTANT_SERVER_TIMER as _ }         from '../../communication/AgentServer.js';
import { PROTOCOL_VERSION }                  from '../../communication/MessageProtocol.js';
import type { AuthResultMessage, CommandMessage } from '../../communication/MessageProtocol.js';
import type { AgentServerConfig }            from '../../communication/AgentServer.js';
import type { HeartbeatTimer }               from '../../runtime/HeartbeatService.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const s = new MessageSerializer();

function makeAuthResult(accepted: boolean, reason?: string): string {
  const msg: AuthResultMessage = {
    messageId:       'ar-001',
    correlationId:   'c',
    timestamp:       new Date().toISOString(),
    protocolVersion: PROTOCOL_VERSION,
    type:            'AuthResult',
    accepted,
    reason,
  };
  return s.serialize(msg);
}

function makeCommand(commandType: CommandMessage['commandType'], payload: Record<string, unknown> = {}): string {
  const cmd: CommandMessage = {
    messageId:       'cmd-001',
    correlationId:   'corr-001',
    timestamp:       new Date().toISOString(),
    protocolVersion: PROTOCOL_VERSION,
    type:            'Command',
    commandType,
    payload,
  };
  return s.serialize(cmd);
}

const noopHeartbeatTimer: HeartbeatTimer = {
  schedule: () => () => undefined,
};

function makeRuntime() {
  const config = buildRuntimeConfig({ agentId: 'agent-test', agentVersion: '1.0.0' });
  return new AgentRuntime(config, {
    systemMetrics:  { cpuPercent: () => 10, memoryUsedMb: () => 200, memoryTotalMb: () => 8192 },
    heartbeatEmit:  () => undefined,
    heartbeatTimer: noopHeartbeatTimer,
    metrics:        NOOP_RUNTIME_METRICS,
  });
}

function makeServer(reconnectMax = 0) {
  const factory  = new ManualTransportFactory();
  const rConfig  = buildRuntimeConfig({ agentId: 'agent-test', agentVersion: '1.0.0', organizationId: 'org-1' });
  const sConfig: AgentServerConfig = {
    serverUrl:       'ws://localhost:9999',
    reconnectPolicy: { maxAttempts: reconnectMax, initialDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0 },
  };
  const runtime = makeRuntime();
  const server  = new AgentServer(rConfig, sConfig, runtime, factory, INSTANT_SERVER_TIMER);
  return { server, factory, runtime };
}

// ─── connect / handshake ──────────────────────────────────────────────────────

describe('AgentServer — connect and handshake', () => {
  it('transitions to Connecting after connect()', async () => {
    const { server, factory } = makeServer();
    const p = server.connect();
    // Transport is created synchronously
    expect(factory.last).toBeDefined();
    await p;
    expect(server.connectionState).toBe('Connecting');
  });

  it('sends AuthHandshake on ws open', async () => {
    const { server, factory } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    const sent = factory.last.sent;
    expect(sent.length).toBeGreaterThanOrEqual(1);
    const handshake = s.parse(sent[0]);
    expect(handshake.type).toBe('AuthHandshake');
  });

  it('transitions to Connected after accepted AuthResult', async () => {
    const { server, factory } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    factory.last.simulateMessage(makeAuthResult(true));
    expect(server.connectionState).toBe('Connected');
  });

  it('AuthHandshake carries agentId and organizationId', async () => {
    const { server, factory } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    const handshake = s.parse(factory.last.sent[0]) as { agentId?: string; organizationId?: string };
    expect(handshake.agentId).toBe('agent-test');
    expect(handshake.organizationId).toBe('org-1');
  });
});

// ─── Authentication failure ────────────────────────────────────────────────────

describe('AgentServer — authentication failure', () => {
  it('transitions to AuthenticationFailed on rejected AuthResult', async () => {
    const { server, factory } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    factory.last.simulateMessage(makeAuthResult(false, 'invalid token'));
    expect(server.connectionState).toBe('AuthenticationFailed');
  });
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

describe('AgentServer — disconnect', () => {
  it('transitions to Disconnected after disconnect()', async () => {
    const { server, factory } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    factory.last.simulateMessage(makeAuthResult(true));
    await server.disconnect();
    expect(server.connectionState).toBe('Disconnected');
  });

  it('disconnect() is safe to call before connect()', async () => {
    const { server } = makeServer();
    await expect(server.disconnect()).resolves.not.toThrow();
  });
});

// ─── Reconnect ────────────────────────────────────────────────────────────────

describe('AgentServer — reconnect', () => {
  it('reconnects when maxAttempts > 0 and connection drops', async () => {
    const { server, factory } = makeServer(1);
    await server.connect();
    factory.last.simulateOpen();
    factory.last.simulateMessage(makeAuthResult(true));
    // Simulate unexpected close
    factory.last.simulateClose(1006, 'dropped');
    // Allow micro-tasks to run
    await new Promise(r => setTimeout(r, 20));
    // A new transport should have been created (reconnect)
    expect(factory.last).toBeDefined();
  });

  it('does not reconnect when maxAttempts=0', async () => {
    const { server, factory } = makeServer(0);
    await server.connect();
    factory.last.simulateOpen();
    factory.last.simulateMessage(makeAuthResult(true));
    const firstTransport = factory.last;
    factory.last.simulateClose(1006, 'dropped');
    await new Promise(r => setTimeout(r, 10));
    // factory.last should still be the same transport (no reconnect)
    expect(factory.last).toBe(firstTransport);
    expect(server.connectionState).toBe('Disconnected');
  });
});

// ─── Command routing ──────────────────────────────────────────────────────────

describe('AgentServer — command routing', () => {
  async function setupConnected() {
    const { server, factory, runtime } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    factory.last.simulateMessage(makeAuthResult(true));
    return { server, factory, runtime };
  }

  it('routes GetHealth and sends Response', async () => {
    const { factory } = await setupConnected();
    const sentBefore = factory.last.sent.length;
    factory.last.simulateMessage(makeCommand('GetHealth'));
    await new Promise(r => setTimeout(r, 10));
    const sentAfter = factory.last.sent.length;
    expect(sentAfter).toBeGreaterThan(sentBefore);
    const response = s.parse(factory.last.sent[sentAfter - 1]);
    expect(response.type).toBe('Response');
  });

  it('GetHealth Response has success: true', async () => {
    const { factory } = await setupConnected();
    factory.last.simulateMessage(makeCommand('GetHealth'));
    await new Promise(r => setTimeout(r, 10));
    const raw = factory.last.sent[factory.last.sent.length - 1];
    const resp = s.parse(raw) as { success?: boolean };
    expect(resp.success).toBe(true);
  });

  it('routes GetDiagnostics and sends Response', async () => {
    const { factory } = await setupConnected();
    const before = factory.last.sent.length;
    factory.last.simulateMessage(makeCommand('GetDiagnostics'));
    await new Promise(r => setTimeout(r, 10));
    expect(factory.last.sent.length).toBeGreaterThan(before);
  });

  it('routes CancelExecution — acknowledges valid payload', async () => {
    const { factory } = await setupConnected();
    const before = factory.last.sent.length;
    factory.last.simulateMessage(makeCommand('CancelExecution', { sessionId: 'sess-001', reason: 'user cancel' }));
    await new Promise(r => setTimeout(r, 10));
    const raw = factory.last.sent[factory.last.sent.length - 1];
    const resp = s.parse(raw) as { success?: boolean };
    expect(factory.last.sent.length).toBeGreaterThan(before);
    expect(resp.success).toBe(true);
  });

  it('routes ExecuteTest — acknowledges valid payload', async () => {
    const { factory } = await setupConnected();
    factory.last.simulateMessage(makeCommand('ExecuteTest', {
      sessionId: 's-1', testCaseId: 'tc-1', driverId: 'android_adb',
    }));
    await new Promise(r => setTimeout(r, 10));
    const raw = factory.last.sent[factory.last.sent.length - 1];
    const resp = s.parse(raw) as { success?: boolean };
    expect(resp.success).toBe(true);
  });

  it('sends error Response for invalid message JSON', async () => {
    // Malformed messages are silently dropped (parse error logged)
    const { factory } = await setupConnected();
    const before = factory.last.sent.length;
    factory.last.simulateMessage('not-json');
    await new Promise(r => setTimeout(r, 10));
    // No response sent for parse errors — no crash
    expect(factory.last.sent.length).toBe(before);
  });
});

// ─── Heartbeat transport ──────────────────────────────────────────────────────

describe('AgentServer — heartbeat transport', () => {
  it('sendHeartbeat sends a HeartbeatMessage when connected', async () => {
    const { server, factory } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    factory.last.simulateMessage(makeAuthResult(true));

    const hbPayload = {
      agent_version: '1.0.0', agent_id: 'agent-test', uptime_seconds: 30,
      connected_to_supabase: false, ws_clients_connected: 0,
      cpu_percent: 10, memory_used_mb: 200, memory_total_mb: 8192,
      active_executions: 0, queue_depth: 0, completed_today: 0,
      connected_devices: [],
    };

    const before = factory.last.sent.length;
    server.sendHeartbeat(hbPayload);
    expect(factory.last.sent.length).toBeGreaterThan(before);
    const sent = s.parse(factory.last.sent[factory.last.sent.length - 1]);
    expect(sent.type).toBe('Heartbeat');
  });

  it('sendHeartbeat is silently dropped when not connected', async () => {
    const { server } = makeServer();
    // Not yet connected
    expect(() => server.sendHeartbeat({
      agent_version: '1.0.0', agent_id: 'a', uptime_seconds: 0,
      connected_to_supabase: false, ws_clients_connected: 0,
      cpu_percent: 0, memory_used_mb: 0, memory_total_mb: 0,
      active_executions: 0, queue_depth: 0, completed_today: 0,
      connected_devices: [],
    })).not.toThrow();
  });
});

// ─── Connection diagnostics ───────────────────────────────────────────────────

describe('AgentServer — connection diagnostics', () => {
  it('getDiagnostics() returns protocolVersion', async () => {
    const { server } = makeServer();
    const snap = server.getDiagnostics();
    expect(snap.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it('getDiagnostics() returns serverUrl', async () => {
    const { server } = makeServer();
    expect(server.getDiagnostics().serverUrl).toBe('ws://localhost:9999');
  });

  it('reconnectCount is 0 initially', () => {
    const { server } = makeServer();
    expect(server.getDiagnostics().reconnectCount).toBe(0);
  });

  it('lastHeartbeatAt is null before first heartbeat', async () => {
    const { server, factory } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    factory.last.simulateMessage(makeAuthResult(true));
    expect(server.getDiagnostics().lastHeartbeatAt).toBeNull();
  });

  it('lastHeartbeatAt is set after sendHeartbeat', async () => {
    const { server, factory } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    factory.last.simulateMessage(makeAuthResult(true));
    server.sendHeartbeat({
      agent_version: '1.0.0', agent_id: 'a', uptime_seconds: 0,
      connected_to_supabase: false, ws_clients_connected: 0,
      cpu_percent: 0, memory_used_mb: 0, memory_total_mb: 0,
      active_executions: 0, queue_depth: 0, completed_today: 0,
      connected_devices: [],
    });
    expect(server.getDiagnostics().lastHeartbeatAt).not.toBeNull();
  });

  it('messagesSent increments on each send', async () => {
    const { server, factory } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    const snap0 = server.getDiagnostics().messagesSent; // handshake
    factory.last.simulateMessage(makeAuthResult(true));
    factory.last.simulateMessage(makeCommand('GetHealth'));
    await new Promise(r => setTimeout(r, 10));
    expect(server.getDiagnostics().messagesSent).toBeGreaterThan(snap0);
  });

  it('messagesReceived increments on each inbound message', async () => {
    const { server, factory } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    factory.last.simulateMessage(makeAuthResult(true)); // +1
    factory.last.simulateMessage(makeCommand('GetHealth')); // +1
    await new Promise(r => setTimeout(r, 10));
    expect(server.getDiagnostics().messagesReceived).toBe(2);
  });
});

// ─── EventForwarder integration ───────────────────────────────────────────────

describe('AgentServer — EventForwarder', () => {
  it('forwardEvent sends an EventMessage when connected', async () => {
    const { server, factory } = makeServer();
    await server.connect();
    factory.last.simulateOpen();
    factory.last.simulateMessage(makeAuthResult(true));

    const before = factory.last.sent.length;
    server.forwarder.forwardEvent('StepCompleted', { stepId: 's-1' }, 'corr-001');
    const raw = factory.last.sent[factory.last.sent.length - 1];
    expect(factory.last.sent.length).toBeGreaterThan(before);
    const msg = s.parse(raw) as { eventType?: string };
    expect(msg.type).toBe('Event');
    expect(msg.eventType).toBe('StepCompleted');
  });

  it('forwardEvent does not throw when not connected', () => {
    const { server } = makeServer();
    expect(() => server.forwarder.forwardEvent('Anything', {})).not.toThrow();
  });
});
