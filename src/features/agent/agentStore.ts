// ─── M9: Agent Zustand Store ──────────────────────────────────────────────────
// Holds all agent state consumed by the UI. In Phase 9 this will be populated
// by a real WebSocket connection. For M9 it is driven by command dispatches
// and simulated data.

import { create } from 'zustand';
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

export interface AgentStoreState {
  // Connection
  connectionState:  ConnectionState;
  agentState:       AgentState;
  agentId:          string;
  agentVersion:     string;
  protocolVersion:  string;
  heartbeatSeq:     number;
  lastHeartbeatAt:  string | null;

  // Health
  health:           AgentHealthReport | null;

  // Devices
  devices:          AgentDevice[];

  // Diagnostics
  diagnostics:      ConnectionDiagnostics | null;

  // Evidence
  evidenceItems:    EvidenceItem[];

  // Event timeline / console
  events:           ExecutionEvent[];

  // Settings
  settings:         AgentConnectionSettings;

  // Actions
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

  // Commands (stub — Phase 9 wires to real transport)
  executeTest:         (sessionId: string, testCaseId: string) => void;
  cancelExecution:     (sessionId: string) => void;
  refreshDiagnostics:  () => void;
  refreshDevices:      () => void;
}

export const useAgentStore = create<AgentStoreState>((set, get) => ({
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
  settings:         DEFAULT_SETTINGS,

  setConnectionState:  (s) => set({ connectionState: s }),
  setAgentState:       (s) => set({ agentState: s }),
  receiveHeartbeat:    (seq) => set({ heartbeatSeq: seq, lastHeartbeatAt: new Date().toISOString() }),
  setHealth:           (h) => set({ health: h }),
  setDevices:          (d) => set({ devices: d }),
  setDiagnostics:      (d) => set({ diagnostics: d }),

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

  executeTest: (sessionId, testCaseId) => {
    get().pushEvent({
      id:          crypto.randomUUID(),
      timestamp:   new Date().toISOString(),
      eventType:   'ExecuteTest',
      payload:     { sessionId, testCaseId },
    });
  },

  cancelExecution: (sessionId) => {
    get().pushEvent({
      id:          crypto.randomUUID(),
      timestamp:   new Date().toISOString(),
      eventType:   'CancelExecution',
      payload:     { sessionId, reason: 'user_cancel' },
    });
  },

  refreshDiagnostics: () => {
    const now = new Date().toISOString();
    const { connectionState } = get();
    set({
      diagnostics: {
        snapshotAt:         now,
        protocolVersion:    '1.0',
        connectionState,
        connectionUptimeMs: 0,
        reconnectCount:     0,
        lastHeartbeatAt:    get().lastHeartbeatAt,
        serverUrl:          get().settings.serverUrl,
        messagesSent:       0,
        messagesReceived:   0,
      },
    });
  },

  refreshDevices: () => {
    // Phase 9: send GetDiagnostics command and parse response.
    // For M9: no-op (devices come via setDevices after receiving agent data).
  },
}));
