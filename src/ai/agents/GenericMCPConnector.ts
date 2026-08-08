// ─── Generic MCP Connector ────────────────────────────────────────────────────
// Client for any Model Context Protocol server.
// Transport is fully injectable — stdio / SSE / WebSocket adapters can be
// swapped without changing this class. Tests inject a mock transport.
//
// MCP spec: https://spec.modelcontextprotocol.io/specification/
// JSON-RPC 2.0 over the configured transport.

import { AIConnectorError }    from '../types/AITypes';
import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIConnectorCapabilities,
  ConnectorHealth,
  ConnectorConfigSchema,
} from '../types/AITypes';
import { BaseAgentAdapter }    from './BaseAgentAdapter';
import type { AgentTool, MCPTransport } from '../core/IAIAgent';

// ─── Transport interface (injectable) ─────────────────────────────────────────

export interface MCPTransportAdapter {
  connect():    Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  /** Send a JSON-RPC request and await the response. */
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
  /** Send a JSON-RPC notification (no response expected). */
  notify(method: string, params?: unknown): Promise<void>;
}

// ─── MCP wire types ───────────────────────────────────────────────────────────

interface MCPServerCapabilities {
  tools?:    Record<string, unknown>;
  sampling?: Record<string, unknown>;
  prompts?:  Record<string, unknown>;
}

interface MCPInitResult {
  protocolVersion: string;
  capabilities:    MCPServerCapabilities;
  serverInfo:      { name: string; version: string };
}

interface MCPTool {
  name:        string;
  description?: string;
  inputSchema:  Record<string, unknown>;
}

interface MCPToolsListResult  { tools: MCPTool[]; }

interface MCPSamplingMessage {
  role:    string;
  content: { type: 'text'; text: string };
}
interface MCPSamplingResult {
  role:       string;
  content:    { type: string; text?: string };
  model:      string;
  stopReason?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface MCPConnectorConfig {
  readonly id:           string;
  readonly name:         string;
  readonly transport:    MCPTransport;
  readonly timeout?:     number;
}

// ─── Connector ───────────────────────────────────────────────────────────────

export class GenericMCPConnector extends BaseAgentAdapter {
  readonly id:           string;
  readonly name:         string;
  readonly type         = 'mcp_agent' as const;
  readonly agentName:   string;
  readonly mcpTransport: MCPTransport;

  static readonly VERSION = '1.0.0';

  private readonly _cfg:         MCPConnectorConfig;
  private readonly _transport:   MCPTransportAdapter;
  private readonly _aborts      = new Map<string, AbortController>();
  private _serverCaps:           MCPServerCapabilities | null = null;
  private _serverInfo:           { name: string; version: string } | null = null;

  private get _timeout() { return this._cfg.timeout ?? 30_000; }

  constructor(config: MCPConnectorConfig, transport: MCPTransportAdapter) {
    super();
    this._cfg       = config;
    this._transport = transport;
    this.id         = config.id;
    this.name       = config.name;
    this.agentName  = config.name;
    this.mcpTransport = config.transport;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    await this._transport.connect();
    const result = await this._transport.request<MCPInitResult>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities:    { sampling: {} },
      clientInfo:      { name: 'TestHub', version: '1.0.0' },
    });
    this._serverCaps = result.capabilities;
    this._serverInfo = result.serverInfo;
    await this._transport.notify('notifications/initialized');
  }

  async disconnect(): Promise<void> {
    this._serverCaps = null;
    this._serverInfo = null;
    await this._transport.disconnect();
  }

  // ── Health ──────────────────────────────────────────────────────────────────

  async health(): Promise<ConnectorHealth> {
    const t0 = Date.now();
    if (!this._transport.isConnected()) {
      return { status: 'disconnected', latencyMs: 0, checkedAt: new Date().toISOString() };
    }
    try {
      await this._transport.request('ping');
      return {
        status:    'connected',
        latencyMs: Date.now() - t0,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        status:    'error',
        latencyMs: Date.now() - t0,
        checkedAt: new Date().toISOString(),
        message:   err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Tool discovery ────────────────────────────────────────────────────────────

  async listTools(): Promise<AgentTool[]> {
    if (!this._transport.isConnected()) {
      throw new AIConnectorError('MCP connector not connected', 'ALL_FAILED', this.id);
    }
    const result = await this._transport.request<MCPToolsListResult>('tools/list');
    return (result.tools ?? []).map(t => ({
      name:        t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema,
    }));
  }

  // ── Tool invocation ───────────────────────────────────────────────────────────

  async invokeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this._transport.isConnected()) {
      throw new AIConnectorError('MCP connector not connected', 'ALL_FAILED', this.id);
    }
    return await this._transport.request('tools/call', { name, arguments: args });
  }

  // ── Execute (text generation via sampling or tool) ────────────────────────────

  async execute(request: AIRequest): Promise<AIResponse> {
    if (!this._transport.isConnected()) {
      throw new AIConnectorError('MCP connector not connected — call connect() first', 'ALL_FAILED', this.id);
    }

    const t0 = Date.now();
    const ac = new AbortController();
    this._aborts.set(request.requestId, ac);

    try {
      // Prefer sampling if server supports it
      if (this._serverCaps?.sampling) {
        return await this._executeSampling(request, t0);
      }
      // Fallback: look for a text-generation tool
      return await this._executeViaTool(request, t0);
    } finally {
      this._aborts.delete(request.requestId);
    }
  }

  // ── Stream ──────────────────────────────────────────────────────────────────

  // eslint-disable-next-line require-yield
  async *stream(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    // Streaming over MCP sampling is not in the base spec — fall back to execute
    const resp = await this.execute(request);
    yield { requestId: request.requestId, delta: resp.text, done: true, usage: resp.usage };
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────

  async cancel(requestId: string): Promise<void> {
    this._aborts.get(requestId)?.abort();
    this._aborts.delete(requestId);
    // MCP cancellation notification (best-effort)
    try {
      await this._transport.notify('notifications/cancelled', { requestId });
    } catch { /* ignore */ }
  }

  // ── Capabilities / schema ────────────────────────────────────────────────────

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      false,
      supportsStreaming:    false,
      supportsJSON:        true,
      supportsTools:       true,
      supportsReasoning:   false,
      supportsLongContext: false,
      supportsImages:      false,
      supportsFiles:       true,
    };
  }

  configurationSchema(): ConnectorConfigSchema {
    return {
      fields: [
        { key: 'transport', label: 'Transport', type: 'string', required: true, description: 'stdio | sse | websocket' },
        { key: 'timeout',   label: 'Timeout (ms)', type: 'number', required: false, default: 30_000 },
      ],
    };
  }

  /** Diagnostics: expose server info after successful connect. */
  get serverInfo(): { name: string; version: string } | null {
    return this._serverInfo;
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async _executeSampling(request: AIRequest, t0: number): Promise<AIResponse> {
    const messages: MCPSamplingMessage[] = [
      { role: 'user', content: { type: 'text', text: request.userPrompt } },
    ];
    const result = await this._transport.request<MCPSamplingResult>('sampling/createMessage', {
      messages,
      systemPrompt: request.systemPrompt,
      maxTokens:    request.modelPreferences?.maxTokens ?? 8_192,
    });
    const text = result.content.type === 'text' ? (result.content.text ?? '') : '';
    return {
      requestId:          request.requestId,
      text,
      reasoningAvailable: false,
      latency:            Date.now() - t0,
      provider:           this._serverInfo?.name ?? this.name,
      connector:          this.id,
      model:              result.model,
    };
  }

  private async _executeViaTool(request: AIRequest, t0: number): Promise<AIResponse> {
    const tools = await this.listTools();
    const gen   = tools.find(t =>
      ['generate', 'complete', 'chat', 'run'].includes(t.name.toLowerCase()),
    );
    if (!gen) {
      throw new AIConnectorError(
        `No text generation capability found on MCP server '${this.name}'`,
        'NOT_IMPLEMENTED', this.id,
      );
    }
    const result = await this.invokeTool(gen.name, { prompt: request.userPrompt });
    const text   = typeof result === 'string' ? result
      : (result as Record<string, unknown>)?.['text'] as string ?? JSON.stringify(result);
    return {
      requestId:          request.requestId,
      text,
      reasoningAvailable: false,
      latency:            Date.now() - t0,
      provider:           this.name,
      connector:          this.id,
      model:              this.name,
    };
  }
}
