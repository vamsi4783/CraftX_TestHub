// ─── AI Connector Platform — Public API ───────────────────────────────────────
// This is the ONLY import path features should use.
// No feature should import from src/ai/providers/* or src/ai/agents/* directly.

// Types
export type {
  ConnectorType,
  ConnectorStatus,
  AuthMode,
  AITaskType,
  AIAttachment,
  ProjectContext,
  ExecutionContext,
  ModelPreferences,
  AIRequest,
  AIToolCall,
  AIUsage,
  AIResponse,
  AIStreamChunk,
  AIConnectorCapabilities,
  ConnectorHealth,
  ConnectorConfigSchema,
  ConfigField,
  ConfigFieldType,
  AITelemetryEvent,
  TelemetryEventType,
  AIErrorCode,
} from './types/AITypes';
export { ZERO_CAPABILITIES, AIConnectorError } from './types/AITypes';

// Core interfaces
export type { IAIConnector }                        from './core/IAIConnector';
export type { IAIProvider }                         from './core/IAIProvider';
export type { IAIAgent, AgentTool, MCPTransport }   from './core/IAIAgent';

// Registry
export { AIConnectorRegistry }    from './registry/AIConnectorRegistry';
export type { RegistryEntry }     from './registry/AIConnectorRegistry';

// Orchestrator
export { AIOrchestrator }         from './orchestrator/AIOrchestrator';
export {
  DEFAULT_ORCHESTRATOR_CONFIG,
  DEFAULT_RETRY_CONFIG,
}                                 from './orchestrator/OrchestratorConfig';
export type {
  OrchestratorConfig,
  RetryConfig,
  TelemetryHook,
}                                 from './orchestrator/OrchestratorConfig';

// Settings
export {
  DEFAULT_AI_SETTINGS,
  CONNECTOR_IDS,
}                                 from './settings/AISettingsModel';
export type {
  AISettings,
  AIConnectorConfig,
  AIConnectorConfig as ConnectorConfig,
  ConnectorAuthMode,
  ConnectorId,
  MCPConnectionConfig,
}                                 from './settings/AISettingsModel';

// Telemetry
export { NoOpTelemetry, InMemoryTelemetry } from './telemetry/AITelemetry';
export type { IAITelemetry }                from './telemetry/AITelemetry';

// Cache
export { NoOpCache, InMemoryAICache, buildCacheKey } from './cache/AICache';
export type { IAICache }                             from './cache/AICache';

// Security
export { SecureString }             from './security/SecureString';

// Production connectors (M2)
export { GeminiFlashConnector }     from './providers/GeminiFlashConnector';
export type { GeminiFlashConfig }   from './providers/GeminiFlashConnector';
export { OllamaConnector }          from './providers/OllamaConnector';
export type { OllamaConfig }        from './providers/OllamaConnector';
export { OpenAICompatibleConnector } from './providers/OpenAICompatibleConnector';
export type { OpenAICompatibleConfig } from './providers/OpenAICompatibleConnector';
export { GenericMCPConnector }      from './agents/GenericMCPConnector';
export type {
  MCPTransportAdapter,
  MCPConnectorConfig,
}                                   from './agents/GenericMCPConnector';

// Factory
export { AIConnectorFactory }       from './factory/AIConnectorFactory';
export type { ConnectorBuilder }    from './factory/AIConnectorFactory';

// Health monitoring
export { ConnectorHealthMonitor }   from './health/ConnectorHealthMonitor';
export type { ConnectorStats }      from './health/ConnectorHealthMonitor';

// Diagnostics
export {
  getDiagnostics,
  getAllDiagnostics,
  formatDiagnosticsSummary,
}                                   from './diagnostics/ConnectorDiagnostics';
export type { ConnectorDiagnosticReport } from './diagnostics/ConnectorDiagnostics';

// Stream utilities (shared, exposed for testing)
export type { Fetcher }             from './providers/shared/streamUtils';

// Base classes (for building real connector implementations)
export { BaseConnector }       from './connectors/BaseConnector';
export { BaseProviderAdapter } from './providers/BaseProviderAdapter';
export { BaseAgentAdapter }    from './agents/BaseAgentAdapter';

// Adapter stubs — prepared for future implementation
export {
  GeminiAdapter,
  ClaudeAdapter,
  OpenAIAdapter,
  GitHubModelsAdapter,
  OpenRouterAdapter,
  AzureOpenAIAdapter,
  OllamaAdapter,
  LMStudioAdapter,
  VLLMAdapter,
}                              from './providers';
export {
  ClaudeCodeMCPAgent,
  CursorAgent,
  GeminiCLIAgent,
  GitHubCopilotAgent,
  ContinueDevAgent,
  OpenHandsAgent,
  CustomMCPAgent,
}                              from './agents';
export type { CustomMCPAgentConfig } from './agents';
