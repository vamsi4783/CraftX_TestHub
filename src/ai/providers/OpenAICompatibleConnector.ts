// ─── Generic OpenAI-Compatible Connector ─────────────────────────────────────
// One connector supporting any OpenAI-compatible endpoint:
//   LM Studio · vLLM · LocalAI · Groq · OpenRouter · Together AI · Mistral
//   and any other /v1/chat/completions endpoint.
// No vendor is hardcoded — configure via baseUrl + model + optional apiKey.

import { AIConnectorError }    from '../types/AITypes';
import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIConnectorCapabilities,
  ConnectorHealth,
  ConnectorConfigSchema,
  ConnectorType,
} from '../types/AITypes';
import { BaseProviderAdapter }  from './BaseProviderAdapter';
import type { SecureString }    from '../security/SecureString';
import {
  parseSSELines,
  makeTimeoutController,
  extractErrorMessage,
} from './shared/streamUtils';
import type { Fetcher }         from './shared/streamUtils';

// ─── Wire types ───────────────────────────────────────────────────────────────

interface OAIMessage  { role: string; content: string; }
interface OAIDelta    { content?: string; role?: string; }
interface OAIChoice   { message?: OAIMessage; delta?: OAIDelta; finish_reason?: string | null; index: number; }
interface OAIUsage    { prompt_tokens: number; completion_tokens: number; total_tokens: number; }
interface OAIResponse { id?: string; choices: OAIChoice[]; usage?: OAIUsage; model?: string; }

// ─── Config ───────────────────────────────────────────────────────────────────

export interface OpenAICompatibleConfig {
  readonly id:       string;
  readonly name:     string;
  readonly baseUrl:  string;
  readonly model:    string;
  /** Optional — some local endpoints (LM Studio, vLLM) require no key. */
  readonly apiKey?:  SecureString;
  readonly timeout?: number;
  /** Override connector type — defaults to 'api_provider' */
  readonly connectorType?: ConnectorType;
  /** Injected in tests — defaults to globalThis.fetch. */
  readonly fetcher?:  Fetcher;
}

// ─── Connector ───────────────────────────────────────────────────────────────

export class OpenAICompatibleConnector extends BaseProviderAdapter {
  readonly id:          string;
  readonly name:        string;
  readonly type:        ConnectorType;
  readonly modelId:     string;
  readonly providerName: string;

  static readonly VERSION = '1.0.0';

  private readonly _cfg:    OpenAICompatibleConfig;
  private readonly _fetch:  Fetcher;
  private readonly _aborts = new Map<string, AbortController>();
  private readonly _base:  string;

  private get _timeout() { return this._cfg.timeout ?? 30_000; }

  constructor(config: OpenAICompatibleConfig) {
    super();
    this._cfg          = config;
    this._fetch        = config.fetcher ?? globalThis.fetch.bind(globalThis);
    this._base         = config.baseUrl.replace(/\/$/, '');
    this.id            = config.id;
    this.name          = config.name;
    this.modelId       = config.model;
    this.providerName  = config.name;
    this.type          = config.connectorType ?? 'api_provider';
  }

  // ── Health ──────────────────────────────────────────────────────────────────

  async health(): Promise<ConnectorHealth> {
    const t0 = Date.now();
    try {
      const { controller, clear } = makeTimeoutController(5_000);
      try {
        const resp = await this._fetch(`${this._base}/models`, {
          method:  'GET',
          headers: this._authHeaders(),
          signal:  controller.signal,
        });
        return {
          status:    resp.ok ? 'connected' : 'error',
          latencyMs: Date.now() - t0,
          checkedAt: new Date().toISOString(),
          message:   resp.ok ? undefined : `HTTP ${resp.status}`,
        };
      } finally {
        clear();
      }
    } catch (err) {
      return {
        status:    'error',
        latencyMs: Date.now() - t0,
        checkedAt: new Date().toISOString(),
        message:   err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Execute ─────────────────────────────────────────────────────────────────

  async execute(request: AIRequest): Promise<AIResponse> {
    const t0 = Date.now();
    const ac = new AbortController();
    this._aborts.set(request.requestId, ac);

    const { controller, clear } = makeTimeoutController(this._timeout, ac.signal);
    let timedOut = false;
    controller.signal.addEventListener('abort', () => { timedOut = true; }, { once: true });

    try {
      const resp = await this._fetch(`${this._base}/chat/completions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body:    JSON.stringify(this._buildBody(request, false)),
        signal:  controller.signal,
      });

      if (!resp.ok) throw await this._apiError(resp);

      const data = await resp.json() as OAIResponse;
      const text = data.choices?.[0]?.message?.content ?? '';
      return {
        requestId:          request.requestId,
        text,
        reasoningAvailable: false,
        latency:            Date.now() - t0,
        provider:           this.providerName,
        connector:          this.id,
        model:              data.model ?? this.modelId,
        usage: data.usage ? {
          inputTokens:  data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens:  data.usage.total_tokens,
        } : undefined,
      };
    } catch (err) {
      if (err instanceof AIConnectorError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw timedOut
          ? new AIConnectorError('Request timed out', 'TIMEOUT', this.id)
          : new AIConnectorError('Request cancelled', 'ALL_FAILED', this.id);
      }
      throw new AIConnectorError(
        `${this.name} request failed: ${(err as Error).message}`,
        'ALL_FAILED', this.id,
      );
    } finally {
      clear();
      this._aborts.delete(request.requestId);
    }
  }

  // ── Stream ──────────────────────────────────────────────────────────────────

  async *stream(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    const ac = new AbortController();
    this._aborts.set(request.requestId, ac);
    const { controller, clear } = makeTimeoutController(this._timeout, ac.signal);

    try {
      const resp = await this._fetch(`${this._base}/chat/completions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body:    JSON.stringify(this._buildBody(request, true)),
        signal:  controller.signal,
      });

      if (!resp.ok) throw await this._apiError(resp);
      if (!resp.body) throw new AIConnectorError('No response body', 'ALL_FAILED', this.id);

      for await (const jsonStr of parseSSELines(resp.body)) {
        const chunk = JSON.parse(jsonStr) as OAIResponse;
        const delta  = chunk.choices?.[0]?.delta?.content ?? '';
        const done   = chunk.choices?.[0]?.finish_reason != null;
        yield { requestId: request.requestId, delta, done };
        if (done) return;
      }
    } finally {
      clear();
      this._aborts.delete(request.requestId);
    }
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────

  async cancel(requestId: string): Promise<void> {
    this._aborts.get(requestId)?.abort();
    this._aborts.delete(requestId);
  }

  // ── Model listing ────────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    try {
      const resp = await this._fetch(`${this._base}/models`, {
        method: 'GET', headers: this._authHeaders(),
      });
      if (!resp.ok) return [this.modelId];
      const data = await resp.json() as { data?: Array<{ id: string }> };
      return (data.data ?? []).map(m => m.id);
    } catch {
      return [this.modelId];
    }
  }

  // ── Capabilities / schema ────────────────────────────────────────────────────

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      false,
      supportsStreaming:    true,
      supportsJSON:        true,
      supportsTools:       true,
      supportsReasoning:   false,
      supportsLongContext: true,
      supportsImages:      false,
      supportsFiles:       false,
      maxContextTokens:    128_000,
      maxOutputTokens:     4_096,
    };
  }

  configurationSchema(): ConnectorConfigSchema {
    return {
      fields: [
        { key: 'baseUrl', label: 'Base URL',     type: 'url',    required: true,  description: 'e.g. http://localhost:1234/v1' },
        { key: 'model',   label: 'Model Name',   type: 'string', required: true },
        { key: 'apiKey',  label: 'API Key',       type: 'secret', required: false, description: 'Leave empty for local endpoints' },
        { key: 'timeout', label: 'Timeout (ms)',  type: 'number', required: false, default: 30_000 },
      ],
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private _authHeaders(): Record<string, string> {
    if (!this._cfg.apiKey?.isPresent()) return {};
    return { Authorization: `Bearer ${this._cfg.apiKey.reveal()}` };
  }

  private _buildBody(request: AIRequest, stream: boolean): Record<string, unknown> {
    const messages: OAIMessage[] = [];
    if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
    messages.push({ role: 'user', content: request.userPrompt });

    const body: Record<string, unknown> = {
      model:    this.modelId,
      messages,
      stream,
    };
    if (request.modelPreferences?.maxTokens)    body['max_tokens']   = request.modelPreferences.maxTokens;
    if (request.modelPreferences?.temperature !== undefined) body['temperature'] = request.modelPreferences.temperature;
    return body;
  }

  private async _apiError(resp: Response): Promise<AIConnectorError> {
    const detail = await extractErrorMessage(resp);
    if (resp.status === 401 || resp.status === 403) {
      return new AIConnectorError(`Authentication failed: ${detail}`, 'AUTH_FAILED', this.id);
    }
    if (resp.status === 429) {
      return new AIConnectorError(`Rate limit exceeded: ${detail}`, 'ALL_FAILED', this.id);
    }
    return new AIConnectorError(`${this.name} API error: ${detail}`, 'ALL_FAILED', this.id);
  }
}
