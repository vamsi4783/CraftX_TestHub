import type { ConnectorType } from '../types/AITypes';

// ─── Connection config per connector type ─────────────────────────────────────

export type ConnectorAuthMode =
  | 'api_key'
  | 'oauth'
  | 'mcp_stdio'
  | 'mcp_sse'
  | 'mcp_websocket'
  | 'none';

export interface MCPConnectionConfig {
  readonly transport: 'stdio' | 'sse' | 'websocket';
  readonly command?:  string;
  readonly args?:     string[];
  readonly url?:      string;
  readonly env?:      Record<string, string>;
}

// ─── Per-connector configuration model ───────────────────────────────────────

export interface AIConnectorConfig {
  readonly id:             string;
  readonly name:           string;
  readonly type:           ConnectorType;
  readonly priority:       number;
  readonly enabled:        boolean;
  readonly authMode:       ConnectorAuthMode;
  /** User-supplied API key — stored in secure storage, never logged. */
  readonly userApiKey?:    string;
  /** Base URL for local model servers (Ollama, LM Studio, vLLM). */
  readonly localEndpoint?: string;
  /** Transport config for MCP agents. */
  readonly mcpConnection?: MCPConnectionConfig;
  /** Whether this connector uses a free TestHub-managed endpoint. */
  readonly freeConnector?: boolean;
  readonly metadata?:      Record<string, unknown>;
}

// ─── Global AI settings ───────────────────────────────────────────────────────

export interface AISettings {
  readonly connectors:          AIConnectorConfig[];
  readonly defaultConnectorId?: string;
  readonly fallbackConnectorId?: string;
  readonly telemetryEnabled:    boolean;
  readonly cacheEnabled:        boolean;
  readonly maxCacheAgeMs:       number;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  connectors:        [],
  telemetryEnabled:  true,
  cacheEnabled:      false,
  maxCacheAgeMs:     5 * 60 * 1000,
};

// ─── Per-provider known connector IDs (constants, not implementations) ────────

export const CONNECTOR_IDS = {
  // API Providers
  GEMINI:          'gemini',
  CLAUDE:          'claude',
  OPENAI:          'openai',
  GITHUB_MODELS:   'github_models',
  OPENROUTER:      'openrouter',
  AZURE_OPENAI:    'azure_openai',
  // Local Models
  OLLAMA:          'ollama',
  LM_STUDIO:       'lm_studio',
  VLLM:            'vllm',
  // MCP Agents
  CLAUDE_CODE_MCP: 'claude_code_mcp',
  CURSOR:          'cursor',
  GEMINI_CLI:      'gemini_cli',
  GITHUB_COPILOT:  'github_copilot',
  CONTINUE_DEV:    'continue_dev',
  OPENHANDS:       'openhands',
  CUSTOM_MCP:      'custom_mcp',
} as const;

export type ConnectorId = typeof CONNECTOR_IDS[keyof typeof CONNECTOR_IDS];
