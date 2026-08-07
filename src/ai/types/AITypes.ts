// ─── AI Connector Platform — Core Types ──────────────────────────────────────
// Treat AI as a pluggable infrastructure layer, exactly like the Driver
// architecture. Features must never know whether a response came from a cloud
// API, a local model, or an MCP agent.

// ─── Discriminator types ──────────────────────────────────────────────────────

export type ConnectorType = 'api_provider' | 'local_model' | 'mcp_agent';

export type ConnectorStatus = 'connected' | 'disconnected' | 'error' | 'degraded';

export type AuthMode = 'api_key' | 'oauth' | 'mcp_stdio' | 'mcp_sse' | 'mcp_websocket' | 'none';

export type AITaskType =
  | 'test_generation'
  | 'self_healing'
  | 'failure_analysis'
  | 'regression_analysis'
  | 'generic';

// ─── Request sub-types ────────────────────────────────────────────────────────

export interface AIAttachment {
  readonly type: 'image' | 'file' | 'text';
  readonly content: string;
  readonly mimeType?: string;
  readonly name?: string;
}

export interface ProjectContext {
  readonly projectId?: string;
  readonly projectName?: string;
  readonly testSuiteId?: string;
  readonly platform?: string;
  readonly language?: string;
  readonly additionalContext?: Record<string, unknown>;
}

export interface ExecutionContext {
  readonly sessionId?: string;
  readonly testCaseId?: string;
  readonly stepId?: string;
  readonly deviceId?: string;
  readonly failureInfo?: Record<string, unknown>;
  readonly screenshotData?: string;
  readonly logData?: string[];
}

export interface ModelPreferences {
  readonly preferredModel?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly requiresReasoning?: boolean;
  readonly requiresVision?: boolean;
  readonly requiresTools?: boolean;
  readonly requiresStreaming?: boolean;
}

// ─── AIRequest ────────────────────────────────────────────────────────────────

export interface AIRequest {
  readonly requestId: string;
  readonly task: AITaskType;
  readonly systemPrompt?: string;
  readonly userPrompt: string;
  readonly attachments?: AIAttachment[];
  readonly projectContext?: ProjectContext;
  readonly executionContext?: ExecutionContext;
  readonly modelPreferences?: ModelPreferences;
  readonly timeout?: number;
  readonly metadata?: Record<string, unknown>;
}

// ─── AIResponse ───────────────────────────────────────────────────────────────

export interface AIToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  readonly result?: unknown;
}

export interface AIUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cachedTokens?: number;
  readonly estimatedCostUsd?: number;
}

export interface AIResponse {
  readonly requestId: string;
  readonly text: string;
  readonly structuredOutput?: unknown;
  readonly reasoningAvailable: boolean;
  readonly toolCalls?: AIToolCall[];
  readonly usage?: AIUsage;
  readonly latency: number;
  readonly provider: string;
  readonly connector: string;
  readonly model: string;
  readonly warnings?: string[];
}

export interface AIStreamChunk {
  readonly requestId: string;
  readonly delta: string;
  readonly done: boolean;
  readonly usage?: AIUsage;
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export interface AIConnectorCapabilities {
  readonly supportsVision: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsJSON: boolean;
  readonly supportsTools: boolean;
  readonly supportsReasoning: boolean;
  readonly supportsLongContext: boolean;
  readonly supportsImages: boolean;
  readonly supportsFiles: boolean;
  readonly maxContextTokens?: number;
  readonly maxOutputTokens?: number;
}

export const ZERO_CAPABILITIES: AIConnectorCapabilities = {
  supportsVision:    false,
  supportsStreaming: false,
  supportsJSON:      false,
  supportsTools:     false,
  supportsReasoning: false,
  supportsLongContext: false,
  supportsImages:    false,
  supportsFiles:     false,
};

// ─── Health ───────────────────────────────────────────────────────────────────

export interface ConnectorHealth {
  readonly status: ConnectorStatus;
  readonly latencyMs?: number;
  readonly checkedAt: string;
  readonly message?: string;
}

// ─── Configuration schema ─────────────────────────────────────────────────────

export type ConfigFieldType = 'string' | 'number' | 'boolean' | 'secret' | 'url';

export interface ConfigField {
  readonly key: string;
  readonly label: string;
  readonly type: ConfigFieldType;
  readonly required: boolean;
  readonly description?: string;
  readonly default?: unknown;
}

export interface ConnectorConfigSchema {
  readonly fields: ConfigField[];
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

export type TelemetryEventType =
  | 'request_start'
  | 'request_success'
  | 'request_failure'
  | 'connector_selected'
  | 'fallback_triggered'
  | 'retry_attempt'
  | 'health_check';

export interface AITelemetryEvent {
  readonly eventType: TelemetryEventType;
  readonly connectorId: string;
  readonly requestId: string;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export type AIErrorCode =
  | 'NO_CONNECTORS'
  | 'ALL_FAILED'
  | 'TIMEOUT'
  | 'AUTH_FAILED'
  | 'NOT_IMPLEMENTED'
  | 'HEALTH_CHECK_FAILED'
  | 'CAPABILITY_MISMATCH';

export class AIConnectorError extends Error {
  readonly code: AIErrorCode;
  readonly connectorId?: string;

  constructor(message: string, code: AIErrorCode, connectorId?: string) {
    super(message);
    this.name  = 'AIConnectorError';
    this.code  = code;
    this.connectorId = connectorId;
  }
}
