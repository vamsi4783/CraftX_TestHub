/**
 * aiOrchestrationService — runtime AI execution via user-configured connectors.
 *
 * Responsibilities:
 *   - Reads persisted connector metadata from aiConnectorStore (localStorage).
 *   - Retrieves API keys from SecureCredentialStore (sessionStorage, never localStorage).
 *   - Builds a live AIConnectorRegistry + AIOrchestrator on demand.
 *   - Exposes a single execute() entry point for M6/M8/M9 to call.
 *   - No TestHub-owned API key is required or used here.
 *
 * Architecture:
 *   M6/M8/M9  →  aiOrchestrationService.execute(request)
 *                         ↓
 *               AIOrchestrator  (priority + retry + fallback)
 *                         ↓
 *               AIConnectorRegistry
 *                         ↓
 *       user-configured connector (Gemini / Ollama / OAI-compat)
 *
 * SSE/WebSocket MCP connectors with an endpoint are included in orchestration.
 * stdio MCP connectors are skipped — they require a local bridge process.
 * MCP connectors without an endpoint appear in the status panel only.
 *
 * Security:
 *   - API keys are retrieved from SecureCredentialStore; they flow to
 *     the connector constructor as SecureString and are .reveal()-ed only
 *     when building the HTTP Authorization header.
 *   - No key ever appears in logs, localStorage, or error messages.
 */

import {
  AIConnectorRegistry,
  AIOrchestrator,
  AIConnectorFactory,
  DEFAULT_ORCHESTRATOR_CONFIG,
  AIConnectorError,
} from '@/ai';
import { aiRuntimePolicy } from './aiRuntimePolicy';
import type {
  AIRequest,
  AIResponse,
  OrchestratorConfig,
  AIConnectorConfig,
} from '@/ai';
import { aiConnectorStore, type PersistedConnector, type ConnectorKind } from './aiConnectorStore';
import { secureCredentialStore } from './secureCredentialStore';

// ─── Public types ─────────────────────────────────────────────────────────────

export type CostCategory = 'local' | 'free_tier' | 'user_api' | 'mcp';

export interface FallbackChainEntry {
  id: string;
  displayName: string;
  kind: ConnectorKind;
  model?: string;
  endpoint?: string;
  priority: number;
  enabled: boolean;
  costCategory: CostCategory;
  mcpUsable?: boolean;
}

export interface RuntimeStatus {
  hasConnectors: boolean;
  hasUsableConnectors: boolean;
  activeConnectorId: string | undefined;
  activeConnectorName: string | undefined;
  activeConnectorModel: string | undefined;
  fallbackChain: FallbackChainEntry[];
  /** Always false — TestHub never requires its own AI API key. */
  requiresTestHubApiKey: false;
  userApiKeyConfigured: boolean;
  localModelAvailable: boolean;
  mcpAgentAvailable: boolean;
  /** True only if the user has explicitly opted in via aiRuntimePolicy. */
  edgeFunctionEnabled: boolean;
}

export interface TestAIResult {
  success: boolean;
  connectorUsed?: string;
  modelUsed?: string;
  latencyMs: number;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip markdown code fences from a model response so the remainder can be
 * parsed as JSON.  Handles ```json…``` and bare ```…``` wrappers.
 */
export function parseJSONFromText(text: string): unknown {
  const stripped = text
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim();
  return JSON.parse(stripped);
}

function inferCostCategory(c: PersistedConnector): CostCategory {
  if (c.kind === 'mcp')    return 'mcp';
  if (c.kind === 'ollama') return 'local';
  // Has a user-supplied API key → user_api; Gemini without a key → free_tier
  if (secureCredentialStore.hasSecret(c.id)) return 'user_api';
  if (c.kind === 'gemini') return 'free_tier';
  return 'user_api';
}

/** Convert a PersistedConnector + secret into the AIConnectorConfig the factory expects. */
function toConfig(c: PersistedConnector): AIConnectorConfig {
  const apiKey = secureCredentialStore.retrieve(c.id)?.reveal();

  switch (c.kind) {
    case 'gemini':
      return {
        id:         'gemini',
        name:       c.displayName,
        type:       'api_provider',
        priority:   c.priority,
        enabled:    c.enabled,
        authMode:   'api_key',
        userApiKey: apiKey,
        metadata:   { model: c.model ?? 'gemini-2.0-flash' },
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

// ─── Service ─────────────────────────────────────────────────────────────────

const RUNTIME_CONFIG: OrchestratorConfig = {
  ...DEFAULT_ORCHESTRATOR_CONFIG,
  fallbackEnabled:    true,
  requireHealthCheck: false,
  timeoutMs:          30_000,
  // Service layer falls back to the next connector; per-connector retry belongs at the direct layer
  retry: { maxAttempts: 1, initialDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0 },
};

/** SSE/WS MCP connectors with an endpoint URL are usable for text generation. */
function _isMCPUsable(c: PersistedConnector): boolean {
  if (c.kind !== 'mcp') return false;
  const t = c.mcpTransport;
  return (t === 'sse' || t === 'websocket') && !!c.mcpEndpoint;
}

/**
 * Sorted list of enabled connectors usable for text generation.
 *
 * Gemini connectors always require an API key; if the session has expired
 * (SecureCredentialStore cleared on tab close) the connector cannot build,
 * so exclude it here so hasUsableConnectors() gives an accurate answer and
 * callers don't accidentally route to the edge-function fallback.
 */
function usableConnectors(): PersistedConnector[] {
  return aiConnectorStore
    .list()
    .filter(c => {
      if (!c.enabled) return false;
      if (c.kind === 'mcp') return _isMCPUsable(c);
      // Gemini always requires an API key — exclude it when the session key is missing.
      if (c.kind === 'gemini') return secureCredentialStore.hasSecret(c.id);
      return true; // ollama (no key needed) and openai_compatible (key optional)
    })
    .sort((a, b) => a.priority - b.priority);
}

type Disconnectable = { disconnect?: () => Promise<void> };

class AIOrchestrationServiceImpl {
  private _orchestrator: AIOrchestrator | null = null;
  private _dirty = true;
  private _building: Promise<AIOrchestrator> | null = null;
  /** Live MCP connectors in the current orchestrator — disconnected on rebuild. */
  private _mcpConnectors: Disconnectable[] = [];

  /**
   * Mark the cached orchestrator dirty so the next execute() rebuilds it.
   * Call this after any connector add / remove / enable / priority change.
   * Disconnects any open MCP connections from the previous orchestrator.
   */
  invalidate(): void {
    this._disconnectMCP();
    this._orchestrator = null;
    this._building     = null;
    this._dirty        = true;
  }

  private _disconnectMCP(): void {
    for (const c of this._mcpConnectors) {
      c.disconnect?.().catch(() => { /* best-effort */ });
    }
    this._mcpConnectors = [];
  }

  /** True if there is at least one enabled, non-MCP connector configured. */
  hasUsableConnectors(): boolean {
    return usableConnectors().length > 0;
  }

  private async _buildOrchestrator(): Promise<AIOrchestrator> {
    // Disconnect any MCP connections from a previous orchestrator before rebuilding.
    this._disconnectMCP();

    const registry = new AIConnectorRegistry();

    for (const c of usableConnectors()) {
      try {
        const cfg       = toConfig(c);
        const connector = AIConnectorFactory.fromConfig(cfg);
        // Eagerly connect MCP transports before registering.
        if (c.kind === 'mcp') {
          await (connector as unknown as { connect?: () => Promise<void> }).connect?.();
          this._mcpConnectors.push(connector as unknown as Disconnectable);
        }
        registry.register(connector, { priority: c.priority, enabled: true });
      } catch (err) {
        // Connector fails to build or connect — skip and warn.
        // Do NOT log the raw error; it might contain key material.
        const safe = (err instanceof Error ? err.message : String(err))
          .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
        console.warn(`[aiOrchestrationService] skipping "${c.id}": ${safe}`);
      }
    }

    return new AIOrchestrator(registry, RUNTIME_CONFIG);
  }

  private async _ensureOrchestrator(): Promise<AIOrchestrator | null> {
    if (!this.hasUsableConnectors()) return null;
    if (!this._dirty && this._orchestrator) return this._orchestrator;
    // Coalesce concurrent build calls so MCP connectors are only connected once.
    if (!this._building) {
      this._building = this._buildOrchestrator().then(orch => {
        this._orchestrator = orch;
        this._dirty        = false;
        this._building     = null;
        return orch;
      }, err => {
        this._building = null;
        throw err;
      });
    }
    return this._building;
  }

  /**
   * Execute an AI request through the user-configured connectors.
   *
   * Capability filter: supportsJSON — all M6/M8/M9 prompts require structured
   * JSON output, so connectors that cannot produce it are skipped.
   *
   * Throws AIConnectorError('NO_CONNECTORS') if no usable connectors exist.
   * Throws AIConnectorError('ALL_FAILED') if all connectors fail (caller falls
   * back to the Supabase edge function path).
   */
  async execute(request: AIRequest): Promise<AIResponse> {
    const orch = await this._ensureOrchestrator();
    if (!orch) {
      throw new AIConnectorError('No usable AI connectors configured', 'NO_CONNECTORS');
    }
    return orch.execute(request, caps => caps.supportsJSON);
  }

  /** Current runtime status for the UI status panel. */
  getStatus(): RuntimeStatus {
    const all    = aiConnectorStore.list().filter(c => c.enabled).sort((a, b) => a.priority - b.priority);
    const usable = all.filter(c => c.kind !== 'mcp' || _isMCPUsable(c));

    return {
      hasConnectors:        all.length > 0,
      hasUsableConnectors:  usable.length > 0,
      activeConnectorId:    usable[0]?.id,
      activeConnectorName:  usable[0]?.displayName,
      activeConnectorModel: usable[0]?.model,
      fallbackChain: all.map(c => ({
        id:           c.id,
        displayName:  c.displayName,
        kind:         c.kind,
        model:        c.model,
        endpoint:     c.endpoint ?? c.baseUrl ?? c.mcpEndpoint,
        priority:     c.priority,
        enabled:      c.enabled,
        costCategory: inferCostCategory(c),
        mcpUsable:    c.kind === 'mcp' ? _isMCPUsable(c) : undefined,
      })),
      requiresTestHubApiKey: false,
      userApiKeyConfigured:  all.some(c => secureCredentialStore.hasSecret(c.id)),
      localModelAvailable:   all.some(c => c.kind === 'ollama'),
      mcpAgentAvailable:     all.filter(c => c.kind === 'mcp').some(_isMCPUsable),
      edgeFunctionEnabled:   aiRuntimePolicy.isEdgeFunctionEnabled(),
    };
  }

  /**
   * Send a minimal deterministic JSON request through the orchestrator.
   * Used by the "Test AI" button in the UI.  Never exposes API keys.
   */
  async executeTestPrompt(): Promise<TestAIResult> {
    const t0 = Date.now();
    try {
      const response = await this.execute({
        requestId: `testhub_test_${Date.now()}`,
        task:      'generic',
        systemPrompt: 'Return only the JSON the user requests. No explanation.',
        userPrompt:   'Reply with exactly this JSON, nothing else: {"ok":true}',
      });
      return {
        success:      true,
        connectorUsed: response.connector,
        modelUsed:    response.model,
        latencyMs:    Date.now() - t0,
      };
    } catch (err) {
      const msg  = err instanceof Error ? err.message : String(err);
      const safe = msg.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
      return { success: false, error: safe, latencyMs: Date.now() - t0 };
    }
  }
}

export const aiOrchestrationService = new AIOrchestrationServiceImpl();
export { AIOrchestrationServiceImpl };
