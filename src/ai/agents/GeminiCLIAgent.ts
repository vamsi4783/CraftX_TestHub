import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseAgentAdapter }              from './BaseAgentAdapter';

export class GeminiCLIAgent extends BaseAgentAdapter {
  readonly id           = 'gemini_cli';
  readonly name         = 'Gemini CLI';
  readonly type         = 'mcp_agent' as const;
  readonly agentName    = 'Gemini CLI';
  readonly mcpTransport = 'stdio' as const;

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      true,
      supportsStreaming:    true,
      supportsJSON:        true,
      supportsTools:       true,
      supportsReasoning:   true,
      supportsLongContext: true,
      supportsImages:      true,
      supportsFiles:       true,
      maxContextTokens:    1_000_000,
      maxOutputTokens:     8_192,
    };
  }
}
