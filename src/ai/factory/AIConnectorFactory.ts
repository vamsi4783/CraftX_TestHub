// ─── AI Connector Factory ─────────────────────────────────────────────────────
// Creates connector instances from AIConnectorConfig / AISettings.
// Features never switch on connector type — the factory handles all dispatch.
// Extendable via registerBuilder() without modifying existing code.

import { AIConnectorError }          from '../types/AITypes';
import type { IAIConnector }         from '../core/IAIConnector';
import type { AIConnectorConfig, AISettings } from '../settings/AISettingsModel';
import { AIConnectorRegistry }        from '../registry/AIConnectorRegistry';
import { SecureString }               from '../security/SecureString';
import { GeminiFlashConnector }       from '../providers/GeminiFlashConnector';
import { OllamaConnector }            from '../providers/OllamaConnector';
import { OpenAICompatibleConnector }  from '../providers/OpenAICompatibleConnector';
import { GenericMCPConnector }        from '../agents/GenericMCPConnector';
import { WebSocketMCPTransport }      from '../agents/transports/WebSocketMCPTransport';
import { HttpMCPTransport }           from '../agents/transports/HttpMCPTransport';
import type { Fetcher }               from '../providers/shared/streamUtils';

export type ConnectorBuilder = (config: AIConnectorConfig) => IAIConnector;

// ─── Factory ─────────────────────────────────────────────────────────────────

export class AIConnectorFactory {
  private static readonly _builders = new Map<string, ConnectorBuilder>([
    ['gemini',        buildGemini],
    ['gemini_flash',  buildGemini],
    ['ollama',        buildOllama],
    ['lm_studio',     buildOpenAICompat],
    ['vllm',          buildOpenAICompat],
    ['groq',          buildOpenAICompat],
    ['openrouter',    buildOpenAICompat],
    ['together',      buildOpenAICompat],
    ['localai',       buildOpenAICompat],
    ['openai',        buildOpenAICompat],
    ['azure_openai',  buildOpenAICompat],
    ['github_models', buildOpenAICompat],
  ]);

  /** Register a custom builder for a connector id. */
  static registerBuilder(id: string, builder: ConnectorBuilder): void {
    this._builders.set(id, builder);
  }

  /** Create a single connector from a config object. */
  static fromConfig(config: AIConnectorConfig): IAIConnector {
    // 1. Look up exact id
    const byId = this._builders.get(config.id);
    if (byId) return byId(config);

    // 2. Fall back on type
    if (config.type === 'local_model' || (config.type === 'api_provider' && config.localEndpoint)) {
      return config.localEndpoint ? buildOpenAICompat(config) : buildOllama(config);
    }

    // 3. MCP agent connectors
    if (config.type === 'mcp_agent') {
      return buildMCPConnector(config);
    }

    // 4. Any provider with an API key → OpenAI-compat
    if (config.type === 'api_provider' && config.userApiKey) {
      return buildOpenAICompat(config);
    }

    throw new AIConnectorError(
      `No builder registered for connector id '${config.id}' (type '${config.type}').` +
      ' Register one with AIConnectorFactory.registerBuilder().',
      'NOT_IMPLEMENTED',
    );
  }

  /**
   * Create and register all enabled connectors from AISettings into a registry.
   * Returns the registry for immediate use.
   */
  static fromSettings(
    settings: AISettings,
    registry: AIConnectorRegistry = new AIConnectorRegistry(),
  ): AIConnectorRegistry {
    for (const cfg of settings.connectors) {
      if (!cfg.enabled) continue;
      try {
        const connector = this.fromConfig(cfg);
        registry.register(connector, { priority: cfg.priority, enabled: cfg.enabled });
      } catch {
        // skip connectors we can't build (e.g. MCP without transport)
      }
    }
    return registry;
  }

  // ── Test-only override for fetcher ────────────────────────────────────────────
  static _testFetcher?: Fetcher;
}

// ─── Builder functions ────────────────────────────────────────────────────────

function buildMCPConnector(cfg: AIConnectorConfig): IAIConnector {
  const transport = (cfg.metadata?.['mcpTransport'] as string | undefined) ?? 'sse';
  const endpoint  = cfg.localEndpoint ?? (cfg.metadata?.['mcpEndpoint'] as string | undefined);

  if (transport === 'stdio') {
    throw new AIConnectorError(
      'stdio MCP transport requires the execution agent bridge — not available in the browser.',
      'NOT_IMPLEMENTED', cfg.id,
    );
  }

  if (!endpoint) {
    throw new AIConnectorError(
      `MCP connector '${cfg.id}' requires an endpoint URL (localEndpoint or metadata.mcpEndpoint).`,
      'NOT_IMPLEMENTED', cfg.id,
    );
  }

  const opts = { authToken: cfg.userApiKey, timeoutMs: cfg.metadata?.['timeout'] as number | undefined };

  if (transport === 'websocket') {
    const adapter = new WebSocketMCPTransport(endpoint, opts);
    return new GenericMCPConnector({ id: cfg.id, name: cfg.name, transport: 'websocket' }, adapter);
  }

  // Default: sse → Streamable HTTP
  const adapter = new HttpMCPTransport(endpoint, opts);
  return new GenericMCPConnector({ id: cfg.id, name: cfg.name, transport: 'sse' }, adapter);
}

function buildGemini(cfg: AIConnectorConfig): IAIConnector {
  if (!cfg.userApiKey) {
    throw new AIConnectorError(
      `Gemini connector '${cfg.id}' requires userApiKey`,
      'AUTH_FAILED', cfg.id,
    );
  }
  return new GeminiFlashConnector({
    apiKey:  SecureString.from(cfg.userApiKey),
    model:   (cfg.metadata?.['model'] as string | undefined) ?? 'gemini-2.0-flash',
    timeout: (cfg.metadata?.['timeout'] as number | undefined),
    fetcher: AIConnectorFactory._testFetcher,
  });
}

function buildOllama(cfg: AIConnectorConfig): IAIConnector {
  const model = (cfg.metadata?.['model'] as string | undefined) ?? 'llama3.2';
  return new OllamaConnector({
    model,
    endpoint: cfg.localEndpoint,
    timeout:  (cfg.metadata?.['timeout'] as number | undefined),
    fetcher:  AIConnectorFactory._testFetcher,
  });
}

function buildOpenAICompat(cfg: AIConnectorConfig): IAIConnector {
  const baseUrl = cfg.localEndpoint ?? (cfg.metadata?.['baseUrl'] as string | undefined);
  if (!baseUrl) {
    throw new AIConnectorError(
      `OpenAI-compatible connector '${cfg.id}' requires localEndpoint or metadata.baseUrl`,
      'NOT_IMPLEMENTED', cfg.id,
    );
  }
  return new OpenAICompatibleConnector({
    id:      cfg.id,
    name:    cfg.name,
    baseUrl,
    model:   (cfg.metadata?.['model'] as string | undefined) ?? 'default',
    apiKey:  cfg.userApiKey ? SecureString.from(cfg.userApiKey) : undefined,
    timeout: (cfg.metadata?.['timeout'] as number | undefined),
    fetcher: AIConnectorFactory._testFetcher,
  });
}
