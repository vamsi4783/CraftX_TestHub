// ─── M9: Agent UI Types ───────────────────────────────────────────────────────
// Pure presentation types — mirrors execution-agent runtime data shapes.

export type ConnectionState =
  | 'Disconnected'
  | 'Connecting'
  | 'Connected'
  | 'Reconnecting'
  | 'AuthenticationFailed';

export type AgentState =
  | 'Created'
  | 'Starting'
  | 'Running'
  | 'Stopping'
  | 'Stopped'
  | 'Faulted';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
export type DiagnosticsLevel = 'none' | 'basic' | 'verbose';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type DeviceKind = 'android' | 'browser' | 'simulator' | 'emulator';
export type DeviceAvailability = 'available' | 'busy' | 'error' | 'disconnected';

export interface AgentDevice {
  deviceId: string;
  kind: DeviceKind;
  label: string;
  availability: DeviceAvailability;
  registeredAt: string;
  lastHeartbeatAt: string;
}

export interface AgentHealthReport {
  reportedAt: string;
  status: HealthStatus;
  uptimeMs: number;
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  activeExecutions: number;
  queueDepth: number;
  connectedDrivers: number;
  connectedDevices: number;
}

export interface ConnectionDiagnostics {
  snapshotAt: string;
  protocolVersion: string;
  connectionState: ConnectionState;
  connectionUptimeMs: number;
  reconnectCount: number;
  lastHeartbeatAt: string | null;
  serverUrl: string;
  messagesSent: number;
  messagesReceived: number;
}

export interface ReconnectPolicySettings {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export interface AgentConnectionSettings {
  serverUrl: string;
  heartbeatIntervalMs: number;
  reconnectPolicy: ReconnectPolicySettings;
  diagnosticsLevel: DiagnosticsLevel;
  logLevel: LogLevel;
}

export interface EvidenceItem {
  evidenceId: string;
  label: string;
  mimeType: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  sizeBytes?: number;
  retryCount: number;
  capturedAt: string;
}

export interface ExecutionEvent {
  id: string;
  timestamp: string;
  eventType: string;
  payload: Record<string, unknown>;
  correlationId?: string;
}
