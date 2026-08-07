import type { IAIConnector } from './IAIConnector';

export type MCPTransport = 'stdio' | 'sse' | 'websocket';

export interface AgentTool {
  readonly name:        string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/**
 * Specialized interface for MCP / coding agents.
 * Examples: Claude Code MCP, Cursor, Gemini CLI, GitHub Copilot, Continue.dev,
 *           OpenHands, Custom MCP.
 */
export interface IAIAgent extends IAIConnector {
  readonly agentName:    string;
  readonly mcpTransport?: MCPTransport;

  listTools():                                              Promise<AgentTool[]>;
  invokeTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}
