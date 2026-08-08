// ─── Connector Health Monitor ─────────────────────────────────────────────────
// Plugs into AIOrchestrator as a TelemetryHook and tracks per-connector stats:
//   status · latency · last success / failure · uptime · availability
//
// Usage:
//   const monitor = new ConnectorHealthMonitor();
//   const orch = new AIOrchestrator(registry, { ...cfg, telemetryHooks: [monitor] });

import type { TelemetryHook }      from '../orchestrator/OrchestratorConfig';
import type { AITelemetryEvent }   from '../types/AITypes';
import type { ConnectorHealth }    from '../types/AITypes';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectorStats {
  readonly connectorId:      string;
  status:                    ConnectorHealth['status'];
  latencyMsLast?:            number;
  latencyMsAvg:              number;
  lastSuccessAt?:            string;
  lastFailureAt?:            string;
  lastFailureError?:         string;
  requestCount:              number;
  successCount:              number;
  failureCount:              number;
  readonly firstSeenAt:      string;
  uptimeMs:                  number;
  availability:              number;   // successCount / requestCount  (0–1)
}

// ─── Monitor ─────────────────────────────────────────────────────────────────

export class ConnectorHealthMonitor implements TelemetryHook {
  private readonly _stats    = new Map<string, ConnectorStats>();
  private readonly _latencies = new Map<string, number[]>(); // rolling window

  private static readonly LATENCY_WINDOW = 20;

  // ── TelemetryHook ───────────────────────────────────────────────────────────

  onEvent(event: AITelemetryEvent): void {
    if (!event.connectorId) return;

    switch (event.eventType) {
      case 'connector_selected':
        this._ensureEntry(event.connectorId);
        break;

      case 'request_success': {
        const s = this._ensureEntry(event.connectorId);
        const latency = event.metadata?.['latencyMs'] as number | undefined;
        s.requestCount++;
        s.successCount++;
        s.status       = 'connected';
        s.lastSuccessAt = event.timestamp;
        if (latency !== undefined) this._recordLatency(event.connectorId, s, latency);
        s.availability  = s.successCount / s.requestCount;
        break;
      }

      case 'request_failure': {
        const s = this._ensureEntry(event.connectorId);
        s.requestCount++;
        s.failureCount++;
        s.status          = s.successCount > 0 ? 'degraded' : 'error';
        s.lastFailureAt   = event.timestamp;
        s.lastFailureError = event.metadata?.['error'] as string | undefined;
        s.availability     = s.successCount / s.requestCount;
        break;
      }

      case 'health_check': {
        const s = this._ensureEntry(event.connectorId);
        const status = event.metadata?.['status'] as ConnectorHealth['status'] | undefined;
        if (status) s.status = status;
        break;
      }

      case 'retry_attempt': {
        this._ensureEntry(event.connectorId);
        break;
      }

      default:
        break;
    }
  }

  // ── Direct recording (for health checks outside the orchestrator) ───────────

  recordHealth(connectorId: string, health: ConnectorHealth): void {
    const s = this._ensureEntry(connectorId);
    s.status = health.status;
    if (health.latencyMs !== undefined) {
      this._recordLatency(connectorId, s, health.latencyMs);
    }
    if (health.status === 'connected') s.lastSuccessAt = health.checkedAt;
    else if (health.status === 'error') s.lastFailureAt = health.checkedAt;
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  getStats(connectorId: string): ConnectorStats | undefined {
    return this._stats.get(connectorId);
  }

  getAllStats(): ConnectorStats[] {
    return [...this._stats.values()];
  }

  getAvailability(connectorId: string): number {
    return this._stats.get(connectorId)?.availability ?? 0;
  }

  getStatus(connectorId: string): ConnectorHealth['status'] {
    return this._stats.get(connectorId)?.status ?? 'disconnected';
  }

  isHealthy(connectorId: string): boolean {
    const s = this._stats.get(connectorId);
    if (!s) return false;
    return s.status === 'connected' || s.status === 'degraded';
  }

  reset(connectorId?: string): void {
    if (connectorId) {
      this._stats.delete(connectorId);
      this._latencies.delete(connectorId);
    } else {
      this._stats.clear();
      this._latencies.clear();
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private _ensureEntry(connectorId: string): ConnectorStats {
    if (!this._stats.has(connectorId)) {
      this._stats.set(connectorId, {
        connectorId,
        status:        'disconnected',
        latencyMsAvg:  0,
        requestCount:  0,
        successCount:  0,
        failureCount:  0,
        firstSeenAt:   new Date().toISOString(),
        uptimeMs:      0,
        availability:  0,
      });
    }
    return this._stats.get(connectorId)!;
  }

  private _recordLatency(connectorId: string, s: ConnectorStats, latencyMs: number): void {
    s.latencyMsLast = latencyMs;

    if (!this._latencies.has(connectorId)) this._latencies.set(connectorId, []);
    const window = this._latencies.get(connectorId)!;
    window.push(latencyMs);
    if (window.length > ConnectorHealthMonitor.LATENCY_WINDOW) window.shift();

    s.latencyMsAvg = Math.round(window.reduce((a, b) => a + b, 0) / window.length);
  }
}
