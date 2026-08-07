import type { AIConnectorCapabilities } from '../types/AITypes';
import type { MCPTransport }             from '../core/IAIAgent';
import { BaseAgentAdapter }              from './BaseAgentAdapter';

export interface CustomMCPAgentConfig {
  readonly id:           string;
  readonly name:         string;
  readonly transport:    MCPTransport;
  readonly capabilities?: Partial<AIConnectorCapabilities>;
}

/**
 * User-configurable MCP agent for any custom MCP server.
 * Create one instance per custom MCP connection.
 */
export class CustomMCPAgent extends BaseAgentAdapter {
  readonly id:           string;
  readonly name:         string;
  readonly type         = 'mcp_agent' as const;
  readonly agentName:    string;
  readonly mcpTransport: MCPTransport;

  private readonly _caps: AIConnectorCapabilities;

  constructor(config: CustomMCPAgentConfig) {
    super();
    this.id           = config.id;
    this.name         = config.name;
    this.agentName    = config.name;
    this.mcpTransport = config.transport;
    this._caps        = {
      supportsVision:      false,
      supportsStreaming:    false,
      supportsJSON:        true,
      supportsTools:       true,
      supportsReasoning:   false,
      supportsLongContext: false,
      supportsImages:      false,
      supportsFiles:       false,
      ...config.capabilities,
    };
  }

  capabilities(): AIConnectorCapabilities {
    return this._caps;
  }
}
