import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseAgentAdapter }              from './BaseAgentAdapter';

export class GitHubCopilotAgent extends BaseAgentAdapter {
  readonly id           = 'github_copilot';
  readonly name         = 'GitHub Copilot';
  readonly type         = 'mcp_agent' as const;
  readonly agentName    = 'GitHub Copilot';
  readonly mcpTransport = 'sse' as const;

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
