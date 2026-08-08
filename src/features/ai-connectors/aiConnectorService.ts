/**
 * aiConnectorService — bridges the React UI to the AI Connector Platform.
 *
 * The UI never instantiates connector classes directly; it calls this service.
 * The service calls AIConnectorFactory, AIConnectorRegistry, and the
 * ConnectorDiagnostics functions on the user's behalf.
 *
 * API keys flow:  form field → SecureCredentialStore (memory + sessionStorage)
 *                             → SecureString.reveal() only at connector build time
 *                             → connector fetches with the key in an HTTP header
 * They never: appear in logs, in localStorage, in error messages, or in telemetry.
 */

import { aiConnectorStore, type PersistedConnector, type ConnectorKind } from './aiConnectorStore';
import { secureCredentialStore } from './secureCredentialStore';
import {
  AIConnectorFactory,
  getDiagnostics,
  type ConnectorDiagnosticReport,
} from '@/ai';
import type { AIConnectorConfig } from '@/ai';
import type { ConnectorHealth } from '@/ai';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AddGeminiParams {
  displayName: string;
  apiKey: string;       // stored in SecureCredentialStore, NOT in localStorage
  model: string;
  priority: number;
  enabled: boolean;
}

export interface AddOllamaParams {
  displayName: string;
  endpoint: string;
  model: string;
  priority: number;
  enabled: boolean;
}

export interface AddOpenAICompatParams {
  displayName: string;
  baseUrl: string;
  apiKey?: string;      // optional — local endpoints may not need one
  model: string;
  priority: number;
  enabled: boolean;
}

export interface AddMCPParams {
  displayName: string;
  mcpTransport: 'stdio' | 'sse' | 'websocket';
  mcpEndpoint?: string;
  mcpCommand?: string;
  authToken?: string;
  priority: number;
  enabled: boolean;
}

export interface ConnectorTestResult {
  success: boolean;
  health?: ConnectorHealth;
  errorMessage?: string;
  suggestedFix?: string;
}

// ─── ID helpers ──────────────────────────────────────────────────────────────

let _idSeq = 0;
function uniqueId(kind: ConnectorKind): string {
  // Gemini and Ollama are singletons (one per kind) to simplify registry.
  // OAI-compatible and MCP can have multiple instances.
  if (kind === 'gemini') return 'gemini';
  if (kind === 'ollama') return 'ollama';
  _idSeq++;
  return `${kind}_${Date.now()}_${_idSeq}`;
}

// ─── Config builder ───────────────────────────────────────────────────────────

function toAIConnectorConfig(c: PersistedConnector): AIConnectorConfig {
  const apiKey = secureCredentialStore.retrieve(c.id)?.reveal();

  switch (c.kind) {
    case 'gemini':
      return {
        id:          'gemini',
        name:        c.displayName,
        type:        'api_provider',
        priority:    c.priority,
        enabled:     c.enabled,
        authMode:    'api_key',
        userApiKey:  apiKey,
        metadata:    { model: c.model ?? 'gemini-2.0-flash' },
      };

    case 'ollama':
      return {
        id:            'ollama',
        name:          c.displayName,
        type:          'local_model',
        priority:      c.priority,
        enabled:       c.enabled,
        authMode:      'none',
        localEndpoint: c.endpoint,
        metadata:      { model: c.model ?? 'llama3.2' },
      };

    case 'openai_compatible':
      return {
        id:            c.id,
        name:          c.displayName,
        type:          apiKey ? 'api_provider' : 'local_model',
        priority:      c.priority,
        enabled:       c.enabled,
        authMode:      apiKey ? 'api_key' : 'none',
        userApiKey:    apiKey,
        localEndpoint: c.baseUrl,
        metadata:      { model: c.model ?? 'default', baseUrl: c.baseUrl },
      };

    case 'mcp':
      return {
        id:            c.id,
        name:          c.displayName,
        type:          'mcp_agent',
        priority:      c.priority,
        enabled:       c.enabled,
        authMode:      apiKey ? 'api_key' : 'none',
        userApiKey:    apiKey,
        localEndpoint: c.mcpEndpoint,
        metadata: {
          mcpTransport: c.mcpTransport ?? 'stdio',
          mcpEndpoint:  c.mcpEndpoint,
        },
      };
  }
}

// ─── Error to readable message ────────────────────────────────────────────────

function toReadableError(err: unknown): { message: string; suggested: string } {
  const msg = err instanceof Error ? err.message : String(err);
  // Strip any accidental key leakage (defensive — SecureString should prevent this)
  const safe = msg.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');

  if (/auth|unauthorized|401|403|api.?key/i.test(safe)) {
    return { message: 'Authentication failed', suggested: 'Check your API key — it may be invalid or expired.' };
  }
  if (/connect|network|ECONNREFUSED|fetch/i.test(safe)) {
    return { message: 'Could not reach endpoint', suggested: 'Make sure the service is running and the URL is correct.' };
  }
  if (/timeout/i.test(safe)) {
    return { message: 'Request timed out', suggested: 'The service took too long to respond. Try again or increase timeout.' };
  }
  return { message: safe, suggested: 'Check the configuration and try again.' };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const aiConnectorService = {
  // ── Read ──────────────────────────────────────────────────────────────────

  list(): PersistedConnector[] {
    return aiConnectorStore.list().sort((a, b) => a.priority - b.priority);
  },

  get(id: string): PersistedConnector | undefined {
    return aiConnectorStore.get(id);
  },

  getDefault(): string | undefined {
    return aiConnectorStore.getDefault();
  },

  hasApiKey(connectorId: string): boolean {
    return secureCredentialStore.hasSecret(connectorId);
  },

  // ── Create ────────────────────────────────────────────────────────────────

  addGemini(params: AddGeminiParams): PersistedConnector {
    const now = new Date().toISOString();
    const id  = uniqueId('gemini');
    if (aiConnectorStore.get(id)) {
      // Gemini singleton — update instead of adding
      aiConnectorStore.update(id, {
        displayName: params.displayName,
        model:       params.model,
        priority:    params.priority,
        enabled:     params.enabled,
      });
      if (params.apiKey) secureCredentialStore.store(id, params.apiKey);
      return aiConnectorStore.get(id)!;
    }
    const record: PersistedConnector = {
      id, kind: 'gemini',
      displayName: params.displayName,
      model:       params.model,
      priority:    params.priority,
      enabled:     params.enabled,
      createdAt:   now,
      updatedAt:   now,
    };
    aiConnectorStore.add(record);
    if (params.apiKey) secureCredentialStore.store(id, params.apiKey);
    return record;
  },

  addOllama(params: AddOllamaParams): PersistedConnector {
    const now = new Date().toISOString();
    const id  = uniqueId('ollama');
    if (aiConnectorStore.get(id)) {
      aiConnectorStore.update(id, {
        displayName: params.displayName,
        endpoint:    params.endpoint,
        model:       params.model,
        priority:    params.priority,
        enabled:     params.enabled,
      });
      return aiConnectorStore.get(id)!;
    }
    const record: PersistedConnector = {
      id, kind: 'ollama',
      displayName: params.displayName,
      endpoint:    params.endpoint,
      model:       params.model,
      priority:    params.priority,
      enabled:     params.enabled,
      createdAt:   now,
      updatedAt:   now,
    };
    aiConnectorStore.add(record);
    return record;
  },

  addOpenAICompat(params: AddOpenAICompatParams): PersistedConnector {
    const now = new Date().toISOString();
    const id  = uniqueId('openai_compatible');
    const record: PersistedConnector = {
      id, kind: 'openai_compatible',
      displayName: params.displayName,
      baseUrl:     params.baseUrl,
      model:       params.model,
      priority:    params.priority,
      enabled:     params.enabled,
      createdAt:   now,
      updatedAt:   now,
    };
    aiConnectorStore.add(record);
    if (params.apiKey) secureCredentialStore.store(id, params.apiKey);
    return record;
  },

  addMCP(params: AddMCPParams): PersistedConnector {
    const now = new Date().toISOString();
    const id  = uniqueId('mcp');
    const record: PersistedConnector = {
      id, kind: 'mcp',
      displayName:  params.displayName,
      mcpTransport: params.mcpTransport,
      mcpEndpoint:  params.mcpEndpoint,
      mcpCommand:   params.mcpCommand,
      priority:     params.priority,
      enabled:      params.enabled,
      createdAt:    now,
      updatedAt:    now,
    };
    aiConnectorStore.add(record);
    if (params.authToken) secureCredentialStore.store(id, params.authToken);
    return record;
  },

  // ── Update ────────────────────────────────────────────────────────────────

  update(
    id: string,
    changes: Partial<Omit<PersistedConnector, 'id' | 'kind' | 'createdAt'>>,
    newApiKey?: string,
  ): boolean {
    const ok = aiConnectorStore.update(id, changes);
    if (ok && newApiKey) secureCredentialStore.store(id, newApiKey);
    return ok;
  },

  setEnabled(id: string, enabled: boolean): boolean {
    return aiConnectorStore.update(id, { enabled });
  },

  setPriority(id: string, priority: number): boolean {
    return aiConnectorStore.update(id, { priority });
  },

  setDefault(id: string | undefined): void {
    aiConnectorStore.setDefault(id);
  },

  // ── Delete ────────────────────────────────────────────────────────────────

  remove(id: string): boolean {
    secureCredentialStore.clear(id);
    return aiConnectorStore.remove(id);
  },

  // ── Test connection ───────────────────────────────────────────────────────

  async testConnection(id: string): Promise<ConnectorTestResult> {
    const record = aiConnectorStore.get(id);
    if (!record) return { success: false, errorMessage: 'Connector not found' };

    if (record.kind === 'mcp') {
      const t = record.mcpTransport;
      if (t === 'stdio' || !record.mcpEndpoint) {
        return {
          success: false,
          errorMessage: 'stdio MCP transport requires the execution agent bridge — not available in the browser.',
          suggestedFix: 'Start the MCP server with an SSE or WebSocket transport and provide an endpoint URL.',
        };
      }
      // SSE/WebSocket: build connector, connect, health check, disconnect
      try {
        const cfg       = toAIConnectorConfig(record);
        const connector = AIConnectorFactory.fromConfig(cfg);
        await (connector as unknown as { connect?: () => Promise<void> }).connect?.();
        const health = await connector.health();
        await (connector as unknown as { disconnect?: () => Promise<void> }).disconnect?.();
        return { success: health.status === 'connected', health };
      } catch (err) {
        const { message, suggested } = toReadableError(err);
        return { success: false, errorMessage: message, suggestedFix: suggested };
      }
    }

    try {
      const cfg       = toAIConnectorConfig(record);
      const connector = AIConnectorFactory.fromConfig(cfg);
      const health    = await connector.health();
      return { success: health.status === 'connected', health };
    } catch (err) {
      const { message, suggested } = toReadableError(err);
      return { success: false, errorMessage: message, suggestedFix: suggested };
    }
  },

  // ── Diagnostics ───────────────────────────────────────────────────────────

  async getDiagnostics(id: string): Promise<ConnectorDiagnosticReport | null> {
    const record = aiConnectorStore.get(id);
    if (!record || record.kind === 'mcp') return null;
    try {
      const cfg       = toAIConnectorConfig(record);
      const connector = AIConnectorFactory.fromConfig(cfg);
      return await getDiagnostics(connector);
    } catch {
      return null;
    }
  },

  // ── Model discovery (Ollama) ──────────────────────────────────────────────

  async discoverModels(id: string): Promise<string[]> {
    const record = aiConnectorStore.get(id);
    if (!record || record.kind !== 'ollama') return [];
    return this.discoverModelsFromEndpoint(record.endpoint ?? 'http://localhost:11434');
  },

  /**
   * Discover Ollama models from a raw endpoint URL without touching the store.
   * Use this during connector configuration (before the connector is saved).
   */
  async discoverModelsFromEndpoint(endpoint: string): Promise<string[]> {
    try {
      const cfg: AIConnectorConfig = {
        id:            '__discovery__',
        name:          'Discovery',
        type:          'local_model',
        priority:      999,
        enabled:       false,
        authMode:      'none',
        localEndpoint: endpoint,
        metadata:      { model: 'llama3.2' },
      };
      const connector = AIConnectorFactory.fromConfig(cfg);
      const c = connector as unknown as { listModels?: () => Promise<string[]> };
      return (await c.listModels?.()) ?? [];
    } catch {
      return [];
    }
  },
};
