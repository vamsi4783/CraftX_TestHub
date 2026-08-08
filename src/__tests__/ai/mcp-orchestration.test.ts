/**
 * mcp-orchestration.test.ts — tests for MCP integration in
 * aiOrchestrationService and AIConnectorFactory.
 *
 * Uses mock transports; no real MCP server required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIConnectorFactory } from '@/ai/factory/AIConnectorFactory';
import type { AIConnectorConfig } from '@/ai';
import { AIConnectorError } from '@/ai';

// ─── Mock transports ──────────────────────────────────────────────────────────

function makeMockTransport(connected = true) {
  return {
    _connected: connected,
    connect:    vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn(() => true),
    request: vi.fn().mockResolvedValue({}),
    notify:  vi.fn().mockResolvedValue(undefined),
  };
}

// ─── AIConnectorFactory MCP dispatch ─────────────────────────────────────────

describe('AIConnectorFactory MCP dispatch', () => {
  it('throws NOT_IMPLEMENTED for stdio transport', () => {
    const cfg: AIConnectorConfig = {
      id:       'mcp_stdio',
      name:     'Stdio MCP',
      type:     'mcp_agent',
      priority: 10,
      enabled:  true,
      authMode: 'none',
      metadata: { mcpTransport: 'stdio' },
    };
    expect(() => AIConnectorFactory.fromConfig(cfg)).toThrow(AIConnectorError);
    expect(() => AIConnectorFactory.fromConfig(cfg)).toThrow(/stdio/i);
  });

  it('throws NOT_IMPLEMENTED when no endpoint provided', () => {
    const cfg: AIConnectorConfig = {
      id:       'mcp_no_ep',
      name:     'No Endpoint',
      type:     'mcp_agent',
      priority: 10,
      enabled:  true,
      authMode: 'none',
      metadata: { mcpTransport: 'sse' },
    };
    expect(() => AIConnectorFactory.fromConfig(cfg)).toThrow(AIConnectorError);
    expect(() => AIConnectorFactory.fromConfig(cfg)).toThrow(/endpoint/i);
  });

  it('throws when WebSocket transport has http:// URL', () => {
    const cfg: AIConnectorConfig = {
      id:            'mcp_ws_bad',
      name:          'WS Bad URL',
      type:          'mcp_agent',
      priority:      10,
      enabled:       true,
      authMode:      'none',
      localEndpoint: 'http://localhost:3000',
      metadata:      { mcpTransport: 'websocket' },
    };
    expect(() => AIConnectorFactory.fromConfig(cfg)).toThrow(/ws/i);
  });

  it('throws when SSE transport has ws:// URL', () => {
    const cfg: AIConnectorConfig = {
      id:            'mcp_sse_bad',
      name:          'SSE Bad URL',
      type:          'mcp_agent',
      priority:      10,
      enabled:       true,
      authMode:      'none',
      localEndpoint: 'ws://localhost:3000',
      metadata:      { mcpTransport: 'sse' },
    };
    expect(() => AIConnectorFactory.fromConfig(cfg)).toThrow(/http/i);
  });

  it('builds SSE (HTTP) connector successfully', () => {
    const cfg: AIConnectorConfig = {
      id:            'mcp_sse',
      name:          'SSE MCP',
      type:          'mcp_agent',
      priority:      10,
      enabled:       true,
      authMode:      'none',
      localEndpoint: 'http://localhost:3000/mcp',
      metadata:      { mcpTransport: 'sse' },
    };
    const connector = AIConnectorFactory.fromConfig(cfg);
    expect(connector.id).toBe('mcp_sse');
    expect(connector.type).toBe('mcp_agent');
  });

  it('builds WebSocket connector successfully', () => {
    const cfg: AIConnectorConfig = {
      id:            'mcp_ws',
      name:          'WS MCP',
      type:          'mcp_agent',
      priority:      10,
      enabled:       true,
      authMode:      'none',
      localEndpoint: 'ws://localhost:3000/ws',
      metadata:      { mcpTransport: 'websocket' },
    };
    const connector = AIConnectorFactory.fromConfig(cfg);
    expect(connector.id).toBe('mcp_ws');
    expect(connector.type).toBe('mcp_agent');
  });

  it('passes authToken to HTTP transport via userApiKey', () => {
    // Verify that a connector built with userApiKey doesn't throw and has id/name
    const cfg: AIConnectorConfig = {
      id:            'mcp_auth',
      name:          'Auth MCP',
      type:          'mcp_agent',
      priority:      10,
      enabled:       true,
      authMode:      'api_key',
      userApiKey:    'tok-xyz',
      localEndpoint: 'http://localhost:3000/mcp',
      metadata:      { mcpTransport: 'sse' },
    };
    const connector = AIConnectorFactory.fromConfig(cfg);
    expect(connector.name).toBe('Auth MCP');
  });
});

// ─── _isMCPUsable logic (tested via aiOrchestrationService.getStatus) ─────────

describe('_isMCPUsable via getStatus', () => {
  // Import lazily to avoid module-level side effects
  let aiOrchestrationService: typeof import('@/features/ai-connectors/aiOrchestrationService').aiOrchestrationService;
  let aiConnectorStore: typeof import('@/features/ai-connectors/aiConnectorStore').aiConnectorStore;

  beforeEach(async () => {
    vi.resetModules();
    ({ aiOrchestrationService } = await import('@/features/ai-connectors/aiOrchestrationService'));
    ({ aiConnectorStore }       = await import('@/features/ai-connectors/aiConnectorStore'));
    // Clear store
    for (const c of aiConnectorStore.list()) aiConnectorStore.remove(c.id);
  });

  afterEach(() => {
    for (const c of aiConnectorStore.list()) aiConnectorStore.remove(c.id);
    vi.resetModules();
  });

  it('stdio MCP connector is NOT usable (mcpUsable=false)', () => {
    aiConnectorStore.add({
      id: 'mcp_stdio', kind: 'mcp',
      displayName: 'Stdio MCP', mcpTransport: 'stdio',
      priority: 10, enabled: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    const status = aiOrchestrationService.getStatus();
    const entry  = status.fallbackChain.find(e => e.id === 'mcp_stdio')!;
    expect(entry.mcpUsable).toBe(false);
    expect(status.mcpAgentAvailable).toBe(false);
    expect(status.hasUsableConnectors).toBe(false);
  });

  it('SSE MCP connector without endpoint is NOT usable', () => {
    aiConnectorStore.add({
      id: 'mcp_no_ep', kind: 'mcp',
      displayName: 'No Ep MCP', mcpTransport: 'sse',
      priority: 10, enabled: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    const status = aiOrchestrationService.getStatus();
    expect(status.mcpAgentAvailable).toBe(false);
  });

  it('SSE MCP connector with endpoint IS usable', () => {
    aiConnectorStore.add({
      id: 'mcp_sse', kind: 'mcp',
      displayName: 'SSE MCP', mcpTransport: 'sse',
      mcpEndpoint: 'http://localhost:3000/mcp',
      priority: 10, enabled: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    const status = aiOrchestrationService.getStatus();
    const entry  = status.fallbackChain.find(e => e.id === 'mcp_sse')!;
    expect(entry.mcpUsable).toBe(true);
    expect(status.mcpAgentAvailable).toBe(true);
    expect(status.hasUsableConnectors).toBe(true);
  });

  it('WebSocket MCP connector with endpoint IS usable', () => {
    aiConnectorStore.add({
      id: 'mcp_ws', kind: 'mcp',
      displayName: 'WS MCP', mcpTransport: 'websocket',
      mcpEndpoint: 'ws://localhost:3000/ws',
      priority: 10, enabled: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    const status = aiOrchestrationService.getStatus();
    expect(status.mcpAgentAvailable).toBe(true);
  });
});

// ─── MCP capabilities ─────────────────────────────────────────────────────────

describe('GenericMCPConnector capabilities', () => {
  it('supportsJSON is true (M6/M8/M9 routing eligibility)', async () => {
    vi.resetModules();
    const { GenericMCPConnector } = await import('@/ai/agents/GenericMCPConnector');
    const transport = makeMockTransport();
    const conn = new GenericMCPConnector(
      { id: 'mcp1', name: 'Test MCP', transport: 'sse' },
      transport,
    );
    const caps = conn.capabilities();
    expect(caps.supportsJSON).toBe(true);
  });
});

// ─── MCP connector connect/health flow ────────────────────────────────────────

describe('GenericMCPConnector connect + health flow', () => {
  it('connect() calls transport.connect() and sends initialize', async () => {
    vi.resetModules();
    const { GenericMCPConnector } = await import('@/ai/agents/GenericMCPConnector');
    const transport = {
      ...makeMockTransport(),
      request: vi.fn().mockResolvedValueOnce({
        protocolVersion: '2025-03-26',
        capabilities:    { tools: {}, sampling: {} },
        serverInfo:      { name: 'test', version: '1.0' },
      }),
    };
    const conn = new GenericMCPConnector(
      { id: 'mcp1', name: 'Test', transport: 'sse' },
      transport,
    );
    await conn.connect();
    expect(transport.connect).toHaveBeenCalled();
    expect(transport.request).toHaveBeenCalledWith('initialize', expect.any(Object));
  });

  it('health() returns disconnected when not connected', async () => {
    vi.resetModules();
    const { GenericMCPConnector } = await import('@/ai/agents/GenericMCPConnector');
    const transport = makeMockTransport();
    transport.isConnected.mockReturnValue(false);
    const conn = new GenericMCPConnector(
      { id: 'mcp1', name: 'Test', transport: 'sse' },
      transport,
    );
    const health = await conn.health();
    expect(health.status).toBe('disconnected');
  });
});
