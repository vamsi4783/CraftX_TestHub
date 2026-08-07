// ─── Agent Zustand Store — Phase 5 M1 ────────────────────────────────────────
// Holds all agent state consumed by the UI and manages the real WebSocket
// connection to the AgentHubServer running at localhost:8080.
//
// Architecture:
//   Browser  ←→  AgentHubServer (ws://localhost:8080)  ←→  ExecutionEngine
//
// The WebSocket instance lives in a module-level variable (not in Zustand state)
// because WebSocket is not serialisable. All observable state is in Zustand.

import { create }          from 'zustand';
import type {
  AgentState,
  ConnectionState,
  AgentDevice,
  AgentHealthReport,
  ConnectionDiagnostics,
  AgentConnectionSettings,
  EvidenceItem,
  ExecutionEvent,
} from './AgentTypes';

// ─── Message shapes (subset of MessageProtocol used by the browser) ────────────

type MsgType = 'AuthHandshake' | 'AuthResult' | 'Command' | 'Event' | 'Heartbeat' | 'Response' | 'Error';

interface BaseMsg {
  messageId: string; correlationId: string; timestamp: string; protocolVersion: string; type: MsgType;
}

interface AuthHandshakeMsg extends BaseMsg {
  type: 'AuthHandshake'; agentId: string; agentVersion: string; organizationId: string; token: string;
}
interface AuthResultMsg extends BaseMsg { type: 'AuthResult'; accepted: boolean; reason?: string; }
interface CommandMsg extends BaseMsg {
  type: 'Command'; commandType: string; payload: Record<string, unknown>;
}
interface HeartbeatMsg extends BaseMsg {
  type: 'Heartbeat';
  payload: {
    agent_version: string; agent_id: string; uptime_seconds: number;
    cpu_percent: number; memory_used_mb: number; memory_total_mb: number;
    active_executions: number; queue_depth: number; completed_today: number;
    connected_devices: Array<{ deviceId: string; kind: string; label: string }>;
  };
}
interface EventMsg extends BaseMsg { type: 'Event'; eventType: string; payload: Record<string, unknown>; }
interface ResponseMsg extends BaseMsg { type: 'Response'; requestId: string; success: boolean; payload: Record<string, unknown>; }

type AgentMsg = AuthResultMsg | HeartbeatMsg | EventMsg | ResponseMsg;

// ─── Pending response registry ─────────────────────────────────────────────────

type PendingResolve = (msg: ResponseMsg) => void;

// Module-level — not Zustand state
let _ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _reconnectCount = 0;
let _connectedAt: number | null = null;
let _msgSent = 0;
let _msgReceived = 0;
const _pending = new Map<string, PendingResolve>();

function _genId(): string { return crypto.randomUUID(); }
function _now(): string { return new Date().toISOString(); }

// ─── Default settings ──────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AgentConnectionSettings = {
  serverUrl:           'ws://localhost:8080',
  heartbeatIntervalMs: 5000,
  reconnectPolicy: {
    maxAttempts:       10,
    initialDelayMs:    1000,
    backoffMultiplier: 2,
    maxDelayMs:        30000,
  },
  diagnosticsLevel: 'basic',
  logLevel:         'info',
};

// ─── Store shape ───────────────────────────────────────────────────────────────

export interface AgentStoreState {
  connectionState:  ConnectionState;
  agentState:       AgentState;
  agentId:          string;
  agentVersion:     string;
  protocolVersion:  string;
  heartbeatSeq:     number;
  lastHeartbeatAt:  string | null;
  health:           AgentHealthReport | null;
  devices:          AgentDevice[];
  diagnostics:      ConnectionDiagnostics | null;
  evidenceItems:    EvidenceItem[];
  events:           ExecutionEvent[];
  settings:         AgentConnectionSettings;

  // Setters (used internally + by tests)
  setConnectionState:  (s: ConnectionState) => void;
  setAgentState:       (s: AgentState) => void;
  receiveHeartbeat:    (seq: number) => void;
  setHealth:           (h: AgentHealthReport) => void;
  setDevices:          (d: AgentDevice[]) => void;
  setDiagnostics:      (d: ConnectionDiagnostics) => void;
  pushEvent:           (e: ExecutionEvent) => void;
  clearEvents:         () => void;
  upsertEvidence:      (item: EvidenceItem) => void;
  updateSettings:      (patch: Partial<AgentConnectionSettings>) => void;

  // Connection lifecycle
  connect:     () => void;
  disconnect:  () => void;

  // Commands (sent over the real WebSocket when connected)
  executeTest:       (sessionId: string, testCaseId: string, driverId: string, steps: unknown[]) => void;
  cancelExecution:   (sessionId: string, reason?: string) => void;
  pauseExecution:    (sessionId: string) => void;
  resumeExecution:   (sessionId: string) => void;
  refreshDiagnostics: () => Promise<void>;
  refreshDevices:    () => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useAgentStore = create<AgentStoreState>((set, get) => {

  // ── Internal: send a raw JSON string ────────────────────────────────────────
  function _send(msg: unknown): boolean {
    if (_ws?.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify(msg));
      _msgSent++;
      return true;
    }
    return false;
  }

  // ── Internal: send a Command and optionally wait for Response ───────────────
  function _sendCommand(
    commandType: string,
    payload:     Record<string, unknown>,
  ): string {
    const messageId    = _genId();
    const correlationId = payload['sessionId'] as string ?? _genId();
    const cmd: CommandMsg = {
      messageId, correlationId, timestamp: _now(),
      protocolVersion: '1.0', type: 'Command', commandType, payload,
    };
    _send(cmd);
    return messageId;
  }

  function _sendCommandAwait(
    commandType: string,
    payload:     Record<string, unknown>,
    timeoutMs = 5000,
  ): Promise<ResponseMsg> {
    const messageId = _sendCommand(commandType, payload);
    return new Promise<ResponseMsg>((resolve, reject) => {
      const t = setTimeout(() => {
        _pending.delete(messageId);
        reject(new Error(`Command ${commandType} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      _pending.set(messageId, (resp) => {
        clearTimeout(t);
        _pending.delete(messageId);
        resolve(resp);
      });
    });
  }

  // ── Internal: handle inbound messages ───────────────────────────────────────
  function _handleMessage(raw: string): void {
    let msg: AgentMsg;
    try {
      msg = JSON.parse(raw) as AgentMsg;
    } catch {
      return;
    }
    _msgReceived++;

    if (msg.type === 'AuthResult') {
      const ar = msg as AuthResultMsg;
      if (ar.accepted) {
        _connectedAt = Date.now();
        _reconnectCount++;
        set({
          connectionState: 'Connected',
          agentState:      'Running',
        });
      } else {
        set({ connectionState: 'AuthenticationFailed' });
        _ws?.close();
        _ws = null;
      }
      return;
    }

    if (msg.type === 'Heartbeat') {
      const hb = msg as HeartbeatMsg;
      const p  = hb.payload;
      const devices: AgentDevice[] = p.connected_devices.map(d => ({
        deviceId:        d.deviceId,
        kind:            d.kind as AgentDevice['kind'],
        label:           d.label,
        availability:    'available' as const,
        registeredAt:    hb.timestamp,
        lastHeartbeatAt: hb.timestamp,
      }));
      const health: AgentHealthReport = {
        reportedAt:       hb.timestamp,
        status:           'healthy',
        uptimeMs:         p.uptime_seconds * 1000,
        cpuPercent:       p.cpu_percent,
        memoryUsedMb:     p.memory_used_mb,
        memoryTotalMb:    p.memory_total_mb,
        activeExecutions: p.active_executions,
        queueDepth:       p.queue_depth,
        connectedDrivers: 0,
        connectedDevices: p.connected_devices.length,
      };
      const nextSeq = get().heartbeatSeq + 1;
      set({ heartbeatSeq: nextSeq, lastHeartbeatAt: _now(), health, devices });
      return;
    }

    if (msg.type === 'Event') {
      const ev = msg as EventMsg;
      get().pushEvent({
        id:            _genId(),
        timestamp:     ev.timestamp,
        eventType:     ev.eventType,
        payload:       ev.payload,
        correlationId: ev.correlationId,
      });
      return;
    }

    if (msg.type === 'Response') {
      const resp = msg as ResponseMsg;
      const resolve = _pending.get(resp.requestId);
      if (resolve) resolve(resp);
      return;
    }
  }

  // ── Internal: open WebSocket ─────────────────────────────────────────────────
  function _openWs(): void {
    const { settings } = get();
    set({ connectionState: 'Connecting' });

    _ws = new WebSocket(settings.serverUrl);

    _ws.onopen = () => {
      // Send AuthHandshake
      const handshake: AuthHandshakeMsg = {
        messageId:       _genId(),
        correlationId:   'browser-client',
        timestamp:       _now(),
        protocolVersion: '1.0',
        type:            'AuthHandshake',
        agentId:         'browser-client',
        agentVersion:    '5.0.0',
        organizationId:  'local',
        token:           '',
      };
      _ws!.send(JSON.stringify(handshake));
      _msgSent++;
    };

    _ws.onmessage = (ev) => _handleMessage(ev.data as string);

    _ws.onclose = (ev) => {
      _ws = null;
      _connectedAt = null;
      const { settings, connectionState } = get();
      if (connectionState === 'AuthenticationFailed') return;
      set({ connectionState: 'Disconnected', agentState: 'Stopped', health: null });

      // Reconnect with exponential backoff
      const policy = settings.reconnectPolicy;
      if (_reconnectCount < policy.maxAttempts && ev.code !== 4001) {
        set({ connectionState: 'Reconnecting' });
        const delay = Math.min(
          policy.initialDelayMs * Math.pow(policy.backoffMultiplier, _reconnectCount),
          policy.maxDelayMs,
        );
        _reconnectTimer = setTimeout(() => { _openWs(); }, delay);
      }
    };

    _ws.onerror = () => {
      // onclose fires after onerror — let it handle reconnect
    };
  }

  // ─── Zustand state + actions ───────────────────────────────────────────────

  return {
    connectionState: 'Disconnected',
    agentState:      'Stopped',
    agentId:         'browser-client',
    agentVersion:    '5.0.0',
    protocolVersion: '1.0',
    heartbeatSeq:    0,
    lastHeartbeatAt: null,
    health:          null,
    devices:         [],
    diagnostics:     null,
    evidenceItems:   [],
    events:          [],
    settings:        DEFAULT_SETTINGS,

    setConnectionState: (s) => set({ connectionState: s }),
    setAgentState:      (s) => set({ agentState: s }),
    receiveHeartbeat:   (seq) => set({ heartbeatSeq: seq, lastHeartbeatAt: _now() }),
    setHealth:          (h) => set({ health: h }),
    setDevices:         (d) => set({ devices: d }),
    setDiagnostics:     (d) => set({ diagnostics: d }),

    pushEvent: (e) => set((st) => ({
      events: [e, ...st.events].slice(0, 200),
    })),

    clearEvents: () => set({ events: [] }),

    upsertEvidence: (item) => set((st) => {
      const idx = st.evidenceItems.findIndex(e => e.evidenceId === item.evidenceId);
      if (idx === -1) return { evidenceItems: [...st.evidenceItems, item] };
      const next = [...st.evidenceItems];
      next[idx] = item;
      return { evidenceItems: next };
    }),

    updateSettings: (patch) => set((st) => ({
      settings: { ...st.settings, ...patch },
    })),

    // ── Connection lifecycle ───────────────────────────────────────────────────

    connect: () => {
      if (_ws) return;  // already connecting / connected
      _reconnectCount = 0;
      _msgSent = 0;
      _msgReceived = 0;
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      _openWs();
    },

    disconnect: () => {
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      _reconnectCount = 999;  // prevent auto-reconnect
      _ws?.close(1000, 'User disconnected');
      _ws = null;
      set({ connectionState: 'Disconnected', agentState: 'Stopped', health: null });
    },

    // ── Commands ───────────────────────────────────────────────────────────────

    executeTest: (sessionId, testCaseId, driverId, steps) => {
      if (!_ws || _ws.readyState !== WebSocket.OPEN) {
        set(prev => ({
          events: [{
            id: _genId(), timestamp: _now(),
            eventType: 'ExecuteTest_NotConnected',
            payload:   { sessionId, error: 'Agent not connected' },
          }, ...prev.events].slice(0, 200),
        }));
        return;
      }
      _sendCommand('ExecuteTest', { sessionId, testCaseId, driverId, steps });
    },

    cancelExecution: (sessionId, reason = 'user_cancel') => {
      _sendCommand('CancelExecution', { sessionId, reason });
    },

    pauseExecution: (sessionId) => {
      _sendCommand('PauseExecution', { sessionId });
    },

    resumeExecution: (sessionId) => {
      _sendCommand('ResumeExecution', { sessionId });
    },

    refreshDiagnostics: async () => {
      if (get().connectionState !== 'Connected') {
        // Synthesize a local snapshot when disconnected
        set({
          diagnostics: {
            snapshotAt:         _now(),
            protocolVersion:    '1.0',
            connectionState:    get().connectionState,
            connectionUptimeMs: _connectedAt ? Date.now() - _connectedAt : 0,
            reconnectCount:     _reconnectCount,
            lastHeartbeatAt:    get().lastHeartbeatAt,
            serverUrl:          get().settings.serverUrl,
            messagesSent:       _msgSent,
            messagesReceived:   _msgReceived,
          },
        });
        return;
      }
      try {
        const resp = await _sendCommandAwait('GetDiagnostics', {}, 3000);
        if (resp.success) {
          const p = resp.payload;
          set({
            diagnostics: {
              snapshotAt:         _now(),
              protocolVersion:    get().protocolVersion,
              connectionState:    get().connectionState,
              connectionUptimeMs: _connectedAt ? Date.now() - _connectedAt : 0,
              reconnectCount:     _reconnectCount,
              lastHeartbeatAt:    get().lastHeartbeatAt,
              serverUrl:          get().settings.serverUrl,
              messagesSent:       _msgSent,
              messagesReceived:   _msgReceived,
              ...(p as object),
            },
          });
        }
      } catch {
        // Timeout or send failure — use local snapshot
        set({
          diagnostics: {
            snapshotAt:         _now(),
            protocolVersion:    get().protocolVersion,
            connectionState:    get().connectionState,
            connectionUptimeMs: _connectedAt ? Date.now() - _connectedAt : 0,
            reconnectCount:     _reconnectCount,
            lastHeartbeatAt:    get().lastHeartbeatAt,
            serverUrl:          get().settings.serverUrl,
            messagesSent:       _msgSent,
            messagesReceived:   _msgReceived,
          },
        });
      }
    },

    refreshDevices: () => {
      _sendCommand('GetDiagnostics', {});
    },
  };
});
