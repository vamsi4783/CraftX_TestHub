import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseAgentAdapter }              from './BaseAgentAdapter';

export class ContinueDevAgent extends BaseAgentAdapter {
  readonly id           = 'continue_dev';
  readonly name         = 'Continue.dev';
  readonly type         = 'mcp_agent' as const;
  readonly agentName    = 'Continue.dev';
  readonly mcpTransport = 'stdio' as const;

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      false,
      supportsStreaming:    true,
      supportsJSON:        true,
      supportsTools:       true,
      supportsReasoning:   false,
      supportsLongContext: true,
      supportsImages:      false,
      supportsFiles:       true,
      maxContextTokens:    128_000,
      maxOutputTokens:     4_096,
    };
  }
}
