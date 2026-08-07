import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseAgentAdapter }              from './BaseAgentAdapter';

export class ClaudeCodeMCPAgent extends BaseAgentAdapter {
  readonly id           = 'claude_code_mcp';
  readonly name         = 'Claude Code MCP';
  readonly type         = 'mcp_agent' as const;
  readonly agentName    = 'Claude Code';
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
      maxContextTokens:    200_000,
      maxOutputTokens:     64_000,
    };
  }
}
