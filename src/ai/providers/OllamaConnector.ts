// ─── Ollama Connector ─────────────────────────────────────────────────────────
// Production connector for locally-running Ollama servers.
// Supports any Ollama-hosted model, automatic model discovery, streaming.
// Endpoint is configurable; defaults to http://localhost:11434.

import { AIConnectorError }    from '../types/AITypes';
import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIConnectorCapabilities,
  ConnectorHealth,
  ConnectorConfigSchema,
} from '../types/AITypes';
import { BaseProviderAdapter }  from './BaseProviderAdapter';
import {
  parseNDJSON,
  makeTimeoutController,
  extractErrorMessage,
} from './shared/streamUtils';
import type { Fetcher }         from './shared/streamUtils';

// ─── Wire types ───────────────────────────────────────────────────────────────

interface OllamaMessage { role: string; content: string; }

interface OllamaChatResponse {
  model:    string;
  message:  OllamaMessage;
  done:     boolean;
  done_reason?: string;
  eval_count?:       number;
  prompt_eval_count?: number;
}

interface OllamaModel { name: string; modified_at: string; size: number; }
interface OllamaTagsResponse { models: OllamaModel[]; }

// ─── Config ───────────────────────────────────────────────────────────────────

export interface OllamaConfig {
  readonly model:     string;
  readonly endpoint?: string;
  readonly timeout?:  number;
  /** Injected in tests — defaults to globalThis.fetch. */
  readonly fetcher?:  Fetcher;
}

// ─── Connector ───────────────────────────────────────────────────────────────

export class OllamaConnector extends BaseProviderAdapter {
  readonly id:          string;
  readonly name:        string;
  readonly type         = 'local_model' as const;
  readonly modelId:     string;
  readonly providerName = 'Ollama';

  static readonly VERSION = '1.0.0';

  private readonly _cfg:     OllamaConfig;
  private readonly _fetch:   Fetcher;
  private readonly _aborts = new Map<string, AbortController>();
  private readonly _base:   string;

  private get _timeout() { return this._cfg.timeout ?? 60_000; }

  constructor(config: OllamaConfig) {
    super();
    this._cfg   = config;
    this._fetch = config.fetcher ?? globalThis.fetch.bind(globalThis);
    this._base  = (config.endpoint ?? 'http://localhost:11434').replace(/\/$/, '');
    this.modelId = config.model;
    this.id      = `ollama_${config.model.replace(/[^a-z0-9]/gi, '_')}`;
    this.name    = `Ollama (${config.model})`;
  }

  // ── Health ──────────────────────────────────────────────────────────────────

  async health(): Promise<ConnectorHealth> {
    const t0 = Date.now();
    try {
      const { controller, clear } = makeTimeoutController(5_000);
      try {
        const resp = await this._fetch(`${this._base}/api/tags`, {
          method: 'GET',
          signal: controller.signal,
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
      const messages = this._buildMessages(request);
      const resp = await this._fetch(`${this._base}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model: this.modelId, messages, stream: false }),
        signal:  controller.signal,
      });

      if (!resp.ok) {
        const detail = await extractErrorMessage(resp);
        throw new AIConnectorError(`Ollama error: ${detail}`, 'ALL_FAILED', this.id);
      }

      const data = await resp.json() as OllamaChatResponse;
      return {
        requestId:          request.requestId,
        text:               data.message.content,
        reasoningAvailable: false,
        latency:            Date.now() - t0,
        provider:           this.providerName,
        connector:          this.id,
        model:              data.model,
        usage: (data.eval_count !== undefined) ? {
          inputTokens:  data.prompt_eval_count ?? 0,
          outputTokens: data.eval_count,
          totalTokens:  (data.prompt_eval_count ?? 0) + data.eval_count,
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
        `Ollama request failed: ${(err as Error).message}`,
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
      const messages = this._buildMessages(request);
      const resp = await this._fetch(`${this._base}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model: this.modelId, messages, stream: true }),
        signal:  controller.signal,
      });

      if (!resp.ok) {
        const detail = await extractErrorMessage(resp);
        throw new AIConnectorError(`Ollama stream error: ${detail}`, 'ALL_FAILED', this.id);
      }
      if (!resp.body) throw new AIConnectorError('No response body', 'ALL_FAILED', this.id);

      for await (const chunk of parseNDJSON<OllamaChatResponse>(resp.body)) {
        yield {
          requestId: request.requestId,
          delta:     chunk.message?.content ?? '',
          done:      chunk.done,
          usage: chunk.done && chunk.eval_count !== undefined ? {
            inputTokens:  chunk.prompt_eval_count ?? 0,
            outputTokens: chunk.eval_count,
            totalTokens:  (chunk.prompt_eval_count ?? 0) + chunk.eval_count,
          } : undefined,
        };
        if (chunk.done) return;
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

  // ── Model discovery ──────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    try {
      const resp = await this._fetch(`${this._base}/api/tags`, { method: 'GET' });
      if (!resp.ok) return [this.modelId];
      const data = await resp.json() as OllamaTagsResponse;
      return (data.models ?? []).map(m => m.name);
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
      supportsLongContext: false,
      supportsImages:      false,
      supportsFiles:       false,
      maxContextTokens:    8_192,
      maxOutputTokens:     4_096,
    };
  }

  configurationSchema(): ConnectorConfigSchema {
    return {
      fields: [
        { key: 'model',    label: 'Model Name',    type: 'string', required: true },
        { key: 'endpoint', label: 'Ollama URL',    type: 'url',    required: false, default: 'http://localhost:11434' },
        { key: 'timeout',  label: 'Timeout (ms)',  type: 'number', required: false, default: 60_000 },
      ],
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private _buildMessages(request: AIRequest): OllamaMessage[] {
    const msgs: OllamaMessage[] = [];
    if (request.systemPrompt) msgs.push({ role: 'system', content: request.systemPrompt });
    msgs.push({ role: 'user', content: request.userPrompt });
    return msgs;
  }
}
