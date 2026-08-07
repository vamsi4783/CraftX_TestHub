import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseAgentAdapter }              from './BaseAgentAdapter';

export class OpenHandsAgent extends BaseAgentAdapter {
  readonly id           = 'openhands';
  readonly name         = 'OpenHands';
  readonly type         = 'mcp_agent' as const;
  readonly agentName    = 'OpenHands';
  readonly mcpTransport = 'websocket' as const;

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      true,
      supportsStreaming:    true,
      supportsJSON:        true,
      supportsTools:       true,
      supportsReasoning:   false,
      supportsLongContext: true,
      supportsImages:      true,
      supportsFiles:       true,
      maxContextTokens:    200_000,
      maxOutputTokens:     8_192,
    };
  }
}
