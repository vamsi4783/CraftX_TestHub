import { AIConnectorError } from '../types/AITypes';
import type { AIRequest, AIResponse } from '../types/AITypes';
import type { IAIAgent, AgentTool, MCPTransport } from '../core/IAIAgent';
import { BaseConnector }                          from '../connectors/BaseConnector';

/**
 * Base class for all MCP / coding agent adapters.
 * Concrete implementations wire up transport (stdio / SSE / WebSocket).
 * Stubs throw NOT_IMPLEMENTED to signal "register a real connector".
 */
export abstract class BaseAgentAdapter extends BaseConnector implements IAIAgent {
  abstract readonly agentName: string;
  readonly mcpTransport?: MCPTransport;

  async listTools(): Promise<AgentTool[]> {
    return [];
  }

  async invokeTool(_name: string, _args: Record<string, unknown>): Promise<unknown> {
    throw new AIConnectorError(
      `${this.agentName} tool invocation is a stub. Register a real implementation.`,
      'NOT_IMPLEMENTED',
      this.id,
    );
  }

  async execute(_request: AIRequest): Promise<AIResponse> {
    throw new AIConnectorError(
      `${this.agentName} agent is a stub. Register a real implementation before executing.`,
      'NOT_IMPLEMENTED',
      this.id,
    );
  }
}
