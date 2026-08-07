import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseAgentAdapter }              from './BaseAgentAdapter';

export class CursorAgent extends BaseAgentAdapter {
  readonly id           = 'cursor';
  readonly name         = 'Cursor';
  readonly type         = 'mcp_agent' as const;
  readonly agentName    = 'Cursor';
  readonly mcpTransport = 'stdio' as const;

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
      maxContextTokens:    128_000,
      maxOutputTokens:     8_192,
    };
  }
}
