// ─── AIOrchestrator ───────────────────────────────────────────────────────────
// The single entry point features use for all AI operations.
// Knows nothing about Gemini, Claude, Cursor, Ollama — only IAIConnector.
//
// Responsibilities:
//   • Connector selection by priority
//   • Per-attempt timeout
//   • Retry with exponential backoff
//   • Fallback through remaining connectors
//   • Health-check gating (optional)
//   • Telemetry hooks

import { AIConnectorError }      from '../types/AITypes';
import type {
  AIRequest,
  AIResponse,
  AIConnectorCapabilities,
  AITelemetryEvent,
  TelemetryEventType,
} from '../types/AITypes';
import type { IAIConnector }     from '../core/IAIConnector';
import type { AIConnectorRegistry } from '../registry/AIConnectorRegistry';
import {
  DEFAULT_ORCHESTRATOR_CONFIG,
} from './OrchestratorConfig';
import type { OrchestratorConfig } from './OrchestratorConfig';

type ExecuteResult =
  | { success: true;  response: AIResponse }
  | { success: false; error: Error };

export class AIOrchestrator {
  constructor(
    private readonly registry: AIConnectorRegistry,
    private readonly config:   OrchestratorConfig = DEFAULT_ORCHESTRATOR_CONFIG,
    // Injectable for deterministic testing — replaces real setTimeout delay.
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Execute an AI request.
   *
   * @param request         The unified AIRequest.
   * @param capabilityFilter Optional predicate — only connectors matching it
   *                         are considered (still priority-sorted).
   */
  async execute(
    request:          AIRequest,
    capabilityFilter?: (caps: AIConnectorCapabilities) => boolean,
  ): Promise<AIResponse> {
    const candidates = capabilityFilter
      ? this.registry.findByCapability(capabilityFilter)
      : this.registry.listEnabled();

    if (candidates.length === 0) {
      throw new AIConnectorError(
        'No eligible connectors available in registry',
        'NO_CONNECTORS',
      );
    }

    this._emit('request_start', '', request.requestId);

    let lastError: Error | undefined;

    for (let i = 0; i < candidates.length; i++) {
      const entry     = candidates[i];
      const connector = entry.connector;

      // Optional health-check gate
      if (this.config.requireHealthCheck) {
        const health = await connector.health();
        this._emit('health_check', connector.id, request.requestId, {
          status: health.status,
        });
        if (health.status === 'error') continue;
      }

      this._emit('connector_selected', connector.id, request.requestId, {
        priority: entry.priority,
      });

      const result = await this._executeWithRetry(connector, request);

      if (result.success) return result.response;

      lastError = result.error;

      if (!this.config.fallbackEnabled) break;

      // Emit fallback only when there is a next candidate
      if (i < candidates.length - 1) {
        this._emit('fallback_triggered', connector.id, request.requestId, {
          error: lastError.message,
          nextConnector: candidates[i + 1].connector.id,
        });
      }
    }

    throw lastError ?? new AIConnectorError('All connectors failed', 'ALL_FAILED');
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _executeWithRetry(
    connector: IAIConnector,
    request:   AIRequest,
  ): Promise<ExecuteResult> {
    const { retry, timeoutMs } = this.config;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retry.maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(
          retry.initialDelayMs * Math.pow(retry.backoffMultiplier, attempt - 1),
          retry.maxDelayMs,
        );
        this._emit('retry_attempt', connector.id, request.requestId, {
          attempt,
          delayMs: delay,
          previousError: lastError?.message,
        });
        await this.sleep(delay);
      }

      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(
              new AIConnectorError(
                `Request timed out after ${timeoutMs}ms`,
                'TIMEOUT',
                connector.id,
              ),
            ),
            timeoutMs,
          ),
        );

        const response = await Promise.race([
          connector.execute(request),
          timeoutPromise,
        ]);

        this._emit('request_success', connector.id, request.requestId, { attempt });
        return { success: true, response };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this._emit('request_failure', connector.id, request.requestId, {
          attempt,
          error: lastError.message,
        });
      }
    }

    return { success: false, error: lastError! };
  }

  private _emit(
    eventType:   TelemetryEventType,
    connectorId: string,
    requestId:   string,
    metadata?:   Record<string, unknown>,
  ): void {
    if (!this.config.telemetryHooks?.length) return;
    const event: AITelemetryEvent = {
      eventType,
      connectorId,
      requestId,
      timestamp: new Date().toISOString(),
      metadata,
    };
    for (const hook of this.config.telemetryHooks) {
      hook.onEvent(event);
    }
  }
}
