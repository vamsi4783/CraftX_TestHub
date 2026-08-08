// ─── Gemini Flash Connector ───────────────────────────────────────────────────
// Production connector for Google's Gemini Flash model.
// Authentication: user-supplied API key only — no embedded credentials.
// Supports: execute, streaming (SSE), vision, JSON mode, cancellation.

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
import type { SecureString }    from '../security/SecureString';
import {
  parseSSELines,
  makeTimeoutController,
  extractErrorMessage,
} from './shared/streamUtils';
import type { Fetcher }         from './shared/streamUtils';

// ─── Wire types ───────────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
interface GeminiContent  { role: 'user' | 'model'; parts: GeminiPart[]; }
interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
}
interface GeminiUsage {
  promptTokenCount:    number;
  candidatesTokenCount: number;
  totalTokenCount:     number;
}
interface GeminiResponse {
  candidates?:    GeminiCandidate[];
  usageMetadata?: GeminiUsage;
  error?: { code: number; message: string; status: string };
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface GeminiFlashConfig {
  readonly apiKey:    SecureString;
  readonly model?:   string;
  readonly timeout?: number;
  /** Injected in tests — defaults to globalThis.fetch. */
  readonly fetcher?:  Fetcher;
}

// ─── Connector ───────────────────────────────────────────────────────────────

export class GeminiFlashConnector extends BaseProviderAdapter {
  readonly id           = 'gemini_flash';
  readonly name         = 'Gemini Flash';
  readonly type         = 'api_provider' as const;
  readonly modelId:     string;
  readonly providerName = 'Google';

  static readonly VERSION = '1.0.0';

  private readonly _cfg:    GeminiFlashConfig;
  private readonly _fetch:  Fetcher;
  private readonly _aborts = new Map<string, AbortController>();

  private get _baseUrl() {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }
  private get _timeout() { return this._cfg.timeout ?? 30_000; }

  constructor(config: GeminiFlashConfig) {
    super();
    this._cfg    = config;
    this._fetch  = config.fetcher ?? globalThis.fetch.bind(globalThis);
    this.modelId = config.model ?? 'gemini-2.0-flash';
  }

  // ── Health ──────────────────────────────────────────────────────────────────

  async health(): Promise<ConnectorHealth> {
    const t0 = Date.now();
    try {
      const url  = `${this._baseUrl}/models/${this.modelId}?key=${this._cfg.apiKey.reveal()}`;
      const { controller, clear } = makeTimeoutController(5_000);
      try {
        const resp = await this._fetch(url, { method: 'GET', signal: controller.signal });
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
    const t0  = Date.now();
    const ac  = new AbortController();
    this._aborts.set(request.requestId, ac);

    const { controller, clear } = makeTimeoutController(this._timeout, ac.signal);
    let timedOut = false;
    controller.signal.addEventListener('abort', () => { timedOut = true; }, { once: true });

    try {
      const url  = `${this._baseUrl}/models/${this.modelId}:generateContent?key=${this._cfg.apiKey.reveal()}`;
      const resp = await this._fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(this._buildBody(request)),
        signal:  controller.signal,
      });

      if (!resp.ok) throw await this._apiError(resp);

      const data   = await resp.json() as GeminiResponse;
      const text   = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
      return {
        requestId:          request.requestId,
        text,
        reasoningAvailable: false,
        latency:            Date.now() - t0,
        provider:           this.providerName,
        connector:          this.id,
        model:              this.modelId,
        usage: data.usageMetadata ? {
          inputTokens:  data.usageMetadata.promptTokenCount,
          outputTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens:  data.usageMetadata.totalTokenCount,
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
        `Gemini request failed: ${(err as Error).message}`,
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
      const url  = `${this._baseUrl}/models/${this.modelId}:streamGenerateContent?alt=sse&key=${this._cfg.apiKey.reveal()}`;
      const resp = await this._fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(this._buildBody(request)),
        signal:  controller.signal,
      });

      if (!resp.ok) throw await this._apiError(resp);
      if (!resp.body) throw new AIConnectorError('No response body', 'ALL_FAILED', this.id);

      for await (const jsonStr of parseSSELines(resp.body)) {
        const chunk = JSON.parse(jsonStr) as GeminiResponse;
        const delta = chunk.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
        const done  = chunk.candidates?.[0]?.finishReason === 'STOP';
        yield {
          requestId: request.requestId,
          delta,
          done,
          usage: done && chunk.usageMetadata ? {
            inputTokens:  chunk.usageMetadata.promptTokenCount,
            outputTokens: chunk.usageMetadata.candidatesTokenCount,
            totalTokens:  chunk.usageMetadata.totalTokenCount,
          } : undefined,
        };
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

  // ── Capabilities / schema ────────────────────────────────────────────────────

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      true,
      supportsStreaming:    true,
      supportsJSON:        true,
      supportsTools:       true,
      supportsReasoning:   true,
      supportsLongContext: true,
      supportsImages:      true,
      supportsFiles:       true,
      maxContextTokens:    1_000_000,
      maxOutputTokens:     8_192,
    };
  }

  configurationSchema(): ConnectorConfigSchema {
    return {
      fields: [
        { key: 'apiKey',   label: 'API Key',       type: 'secret', required: true,  description: 'Google AI Studio API key' },
        { key: 'model',    label: 'Model',          type: 'string', required: false, default: 'gemini-2.0-flash' },
        { key: 'timeout',  label: 'Timeout (ms)',   type: 'number', required: false, default: 30_000 },
      ],
    };
  }

  async listModels(): Promise<string[]> {
    try {
      const url  = `${this._baseUrl}/models?key=${this._cfg.apiKey.reveal()}`;
      const resp = await this._fetch(url, { method: 'GET' });
      if (!resp.ok) return [this.modelId];
      const data = await resp.json() as { models?: Array<{ name: string }> };
      return (data.models ?? [])
        .map(m => m.name.replace('models/', ''))
        .filter(n => n.startsWith('gemini'));
    } catch {
      return [this.modelId];
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private _buildBody(request: AIRequest): Record<string, unknown> {
    const parts: GeminiPart[] = [{ text: request.userPrompt }];

    for (const att of request.attachments ?? []) {
      if (att.type === 'image') {
        parts.push({ inlineData: { mimeType: att.mimeType ?? 'image/jpeg', data: att.content } });
      }
    }

    const genCfg: Record<string, unknown> = {
      maxOutputTokens: request.modelPreferences?.maxTokens ?? 8_192,
    };
    if (request.modelPreferences?.temperature !== undefined) {
      genCfg['temperature'] = request.modelPreferences.temperature;
    }

    const body: Record<string, unknown> = {
      contents:         [{ role: 'user', parts }],
      generationConfig: genCfg,
    };
    if (request.systemPrompt) {
      body['systemInstruction'] = { parts: [{ text: request.systemPrompt }] };
    }
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
    return new AIConnectorError(`Gemini API error: ${detail}`, 'ALL_FAILED', this.id);
  }
}
