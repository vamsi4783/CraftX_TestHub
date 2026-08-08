import { describe, it, expect, beforeEach } from 'vitest';
import { GenericMCPConnector }     from '../../ai/agents/GenericMCPConnector';
import type { MCPTransportAdapter } from '../../ai/agents/GenericMCPConnector';
import { AIConnectorError }        from '../../ai/types/AITypes';
import { makeRequest, isValidAIResponse } from './helpers/testHelpers';

// ─── Mock transport ───────────────────────────────────────────────────────────

class MockMCPTransport implements MCPTransportAdapter {
  private _connected = false;
  connectCallCount   = 0;
  disconnectCallCount = 0;
  notifyCallCount    = 0;

  /** Pre-configure responses per JSON-RPC method. */
  responses = new Map<string, unknown | Error>();

  async connect()    { this._connected = true;  this.connectCallCount++;    }
  async disconnect() { this._connected = false; this.disconnectCallCount++; }
  isConnected()      { return this._connected; }

  async request<T>(method: string, _params?: unknown): Promise<T> {
    if (!this.responses.has(method)) throw new Error(`No mock for method: ${method}`);
    const resp = this.responses.get(method)!;
    if (resp instanceof Error) throw resp;
    return resp as T;
  }

  async notify(_method: string, _params?: unknown): Promise<void> {
    this.notifyCallCount++;
  }
}

function makeTransport() {
  const t = new MockMCPTransport();
  t.responses.set('initialize', {
    protocolVersion: '2024-11-05',
    capabilities:    { tools: {}, sampling: {} },
    serverInfo:      { name: 'TestMCP', version: '1.0.0' },
  });
  t.responses.set('ping', {});
  t.responses.set('tools/list', {
    tools: [
      { name: 'generate', description: 'Generate text', inputSchema: {} },
      { name: 'search',   description: 'Search docs',   inputSchema: { query: { type: 'string' } } },
    ],
  });
  t.responses.set('sampling/createMessage', {
    role:       'assistant',
    content:    { type: 'text', text: 'Sampled response' },
    model:      'claude-3',
    stopReason: 'endTurn',
  });
  t.responses.set('tools/call', { content: 'Tool result' });
  return t;
}

function makeConnector(transport = makeTransport()) {
  return {
    connector: new GenericMCPConnector(
      { id: 'test-mcp', name: 'Test MCP', transport: 'stdio' },
      transport,
    ),
    transport,
  };
}

// ─── Connect / disconnect ─────────────────────────────────────────────────────

describe('GenericMCPConnector — connect / disconnect', () => {
  it('connect() calls transport.connect() and sends initialize', async () => {
    const { connector, transport } = makeConnector();
    await connector.connect();
    expect(transport.connectCallCount).toBe(1);
    expect(transport.notifyCallCount).toBeGreaterThanOrEqual(1);
  });

  it('connect() stores server capabilities', async () => {
    const { connector } = makeConnector();
    await connector.connect();
    expect(connector.serverInfo?.name).toBe('TestMCP');
  });

  it('disconnect() calls transport.disconnect()', async () => {
    const { connector, transport } = makeConnector();
    await connector.connect();
    await connector.disconnect();
    expect(transport.disconnectCallCount).toBe(1);
  });

  it('disconnect() clears server info', async () => {
    const { connector } = makeConnector();
    await connector.connect();
    await connector.disconnect();
    expect(connector.serverInfo).toBeNull();
  });

  it('execute() before connect() throws ALL_FAILED', async () => {
    const { connector } = makeConnector();
    await expect(connector.execute(makeRequest())).rejects.toMatchObject({ code: 'ALL_FAILED' });
  });
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe('GenericMCPConnector — health', () => {
  let connector: GenericMCPConnector;
  let transport: MockMCPTransport;

  beforeEach(() => {
    ({ connector, transport } = makeConnector());
  });

  it('returns disconnected when not connected', async () => {
    const h = await connector.health();
    expect(h.status).toBe('disconnected');
  });

  it('returns connected after successful ping', async () => {
    await connector.connect();
    const h = await connector.health();
    expect(h.status).toBe('connected');
  });

  it('returns error when ping throws', async () => {
    await connector.connect();
    transport.responses.set('ping', new Error('network failure'));
    const h = await connector.health();
    expect(h.status).toBe('error');
    expect(h.message).toContain('network failure');
  });

  it('includes latencyMs in connected health', async () => {
    await connector.connect();
    const h = await connector.health();
    expect(typeof h.latencyMs).toBe('number');
  });
});

// ─── Tool discovery ───────────────────────────────────────────────────────────

describe('GenericMCPConnector — capability discovery (tools)', () => {
  it('listTools() returns tools from tools/list', async () => {
    const { connector } = makeConnector();
    await connector.connect();
    const tools = await connector.listTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('generate');
  });

  it('listTools() before connect() throws ALL_FAILED', async () => {
    const { connector } = makeConnector();
    await expect(connector.listTools()).rejects.toMatchObject({ code: 'ALL_FAILED' });
  });

  it('tool has name, description, inputSchema', async () => {
    const { connector } = makeConnector();
    await connector.connect();
    const tools = await connector.listTools();
    for (const t of tools) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(typeof t.inputSchema).toBe('object');
    }
  });
});

// ─── Tool invocation ──────────────────────────────────────────────────────────

describe('GenericMCPConnector — tool invocation', () => {
  it('invokeTool() calls tools/call with name and arguments', async () => {
    const { connector } = makeConnector();
    await connector.connect();
    const result = await connector.invokeTool('search', { query: 'test' });
    expect(result).toBeTruthy();
  });

  it('invokeTool() before connect() throws ALL_FAILED', async () => {
    const { connector } = makeConnector();
    await expect(connector.invokeTool('search', {})).rejects.toMatchObject({ code: 'ALL_FAILED' });
  });

  it('invokeTool() propagates errors from transport', async () => {
    const { connector, transport } = makeConnector();
    await connector.connect();
    transport.responses.set('tools/call', new Error('tool failed'));
    await expect(connector.invokeTool('search', {})).rejects.toThrow('tool failed');
  });
});

// ─── Execute (sampling path) ──────────────────────────────────────────────────

describe('GenericMCPConnector — execute via sampling', () => {
  it('returns valid AIResponse using sampling/createMessage', async () => {
    const { connector } = makeConnector();
    await connector.connect();
    const r = await connector.execute(makeRequest());
    expect(isValidAIResponse(r)).toBe(true);
    expect(r.text).toBe('Sampled response');
  });

  it('populates connector and model in response', async () => {
    const { connector } = makeConnector();
    await connector.connect();
    const r = await connector.execute(makeRequest());
    expect(r.connector).toBe('test-mcp');
    expect(r.model).toBe('claude-3');
  });
});

// ─── Execute (tool fallback) ──────────────────────────────────────────────────

describe('GenericMCPConnector — execute via tool fallback', () => {
  it('falls back to tool when sampling not available', async () => {
    const t = makeTransport();
    // Remove sampling capability
    t.responses.set('initialize', {
      protocolVersion: '2024-11-05',
      capabilities:    { tools: {} },
      serverInfo:      { name: 'NoSampling', version: '1.0.0' },
    });
    t.responses.set('tools/call', 'Tool generated text');
    const c = new GenericMCPConnector(
      { id: 'no-sample', name: 'NoSample', transport: 'stdio' },
      t,
    );
    await c.connect();
    const r = await c.execute(makeRequest());
    expect(r.text).toBeTruthy();
  });

  it('throws NOT_IMPLEMENTED when no sampling and no generation tool', async () => {
    const t = makeTransport();
    t.responses.set('initialize', {
      protocolVersion: '2024-11-05',
      capabilities:    { tools: {} },
      serverInfo:      { name: 'NoGen', version: '1.0.0' },
    });
    t.responses.set('tools/list', { tools: [{ name: 'echo', description: '', inputSchema: {} }] });
    const c = new GenericMCPConnector(
      { id: 'no-gen', name: 'NoGen', transport: 'stdio' },
      t,
    );
    await c.connect();
    await expect(c.execute(makeRequest())).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});

// ─── Cancellation ─────────────────────────────────────────────────────────────

describe('GenericMCPConnector — cancellation', () => {
  it('cancel() does not throw for unknown requestId', async () => {
    const { connector } = makeConnector();
    await expect(connector.cancel('unknown')).resolves.toBeUndefined();
  });

  it('cancel() sends cancellation notification to transport', async () => {
    const { connector, transport } = makeConnector();
    await connector.connect();
    await connector.cancel('req-1');
    expect(transport.notifyCallCount).toBeGreaterThan(1);
  });
});

// ─── Capabilities ─────────────────────────────────────────────────────────────

describe('GenericMCPConnector — capabilities', () => {
  it('type is mcp_agent', () => {
    expect(makeConnector().connector.type).toBe('mcp_agent');
  });

  it('supportsTools is true', () => {
    expect(makeConnector().connector.capabilities().supportsTools).toBe(true);
  });

  it('configurationSchema has transport field', () => {
    const schema = makeConnector().connector.configurationSchema();
    expect(schema.fields.some(f => f.key === 'transport')).toBe(true);
  });
});
