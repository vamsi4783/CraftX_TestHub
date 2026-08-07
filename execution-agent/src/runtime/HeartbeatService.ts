// ─── HeartbeatService ─────────────────────────────────────────────────────────
// Emits an AgentHeartbeat event on a fixed interval.
// No WebSocket in Phase 3 — heartbeats go through the event abstraction only.
//
// Timer is injectable for test-time control: pass a ManualClock to drive ticks
// without real wall-clock delays.

import type { AgentHeartbeatPayload } from '../events/definitions/health.events.js';
import type { RuntimeMetricsHooks }   from './RuntimeMetrics.js';
import { NOOP_RUNTIME_METRICS }       from './RuntimeMetrics.js';
import type { HealthMonitor }         from './HealthMonitor.js';
import type { DeviceInventory }       from './DeviceInventory.js';
import type { RuntimeConfiguration }  from './RuntimeConfiguration.js';
import { StructuredLogger }           from '../logging/StructuredLogger.js';

export type HeartbeatEmitFn = (payload: AgentHeartbeatPayload) => Promise<void> | void;

/** Minimal timer abstraction — real: setInterval/clearInterval. */
export interface HeartbeatTimer {
  schedule(fn: () => void, intervalMs: number): () => void; // returns cancel fn
}

/** Real timer using Node.js setInterval. */
export const REAL_HEARTBEAT_TIMER: HeartbeatTimer = {
  schedule(fn, intervalMs) {
    const handle = setInterval(fn, intervalMs);
    return () => clearInterval(handle);
  },
};

export class HeartbeatService {
  private readonly logger = new StructuredLogger('HeartbeatService');
  private _cancel: (() => void) | null = null;
  private _sequence = 0;
  private readonly startedAt = Date.now();

  constructor(
    private readonly config:    RuntimeConfiguration,
    private readonly emit:      HeartbeatEmitFn,
    private readonly monitor:   HealthMonitor,
    private readonly inventory: DeviceInventory,
    private readonly timer:     HeartbeatTimer       = REAL_HEARTBEAT_TIMER,
    private readonly metrics:   RuntimeMetricsHooks  = NOOP_RUNTIME_METRICS,
  ) {}

  start(): void {
    if (this._cancel) return; // already running
    this._cancel = this.timer.schedule(() => void this._tick(), this.config.heartbeatIntervalMs);
    this.logger.info('heartbeat_service_started', {
      interval_ms: this.config.heartbeatIntervalMs,
    });
  }

  stop(): void {
    if (this._cancel) {
      this._cancel();
      this._cancel = null;
      this.logger.info('heartbeat_service_stopped', { sequence: this._sequence });
    }
  }

  /** For tests: manually trigger one heartbeat tick without waiting for the interval. */
  async tick(): Promise<void> {
    return this._tick();
  }

  get sequenceNumber(): number { return this._sequence; }

  private async _tick(): Promise<void> {
    this._sequence++;
    const seq = this._sequence;

    try {
      const report = this.monitor.lastReport();
      const devices = this.inventory.all().map(d => ({
        driver_id:     d.driverId,
        device_serial: d.deviceId,
        device_model:  d.deviceModel,
        os_version:    d.osVersion,
        status:        d.availability === 'available' ? 'ready' as const
                     : d.availability === 'busy'      ? 'busy' as const
                                                      : 'error' as const,
      }));

      const payload: AgentHeartbeatPayload = {
        agent_version:          this.config.agentVersion,
        agent_id:               this.config.agentId,
        uptime_seconds:         Math.floor((Date.now() - this.startedAt) / 1000),
        connected_to_supabase:  false,  // Phase 7 wires this up
        ws_clients_connected:   0,      // Phase 7 — WebSocket not yet implemented
        cpu_percent:            report?.cpuPercent    ?? 0,
        memory_used_mb:         report?.memoryUsedMb  ?? 0,
        memory_total_mb:        report?.memoryTotalMb ?? 0,
        active_executions:      report?.activeExecutions ?? 0,
        queue_depth:            report?.queueDepth   ?? 0,
        completed_today:        0,      // Phase 7 — session store integration
        connected_devices:      devices,
      };

      await this.emit(payload);
      this.metrics.heartbeat_sent(this.config.agentId, seq);

      this.logger.info('heartbeat_emitted', { sequence: seq });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.metrics.heartbeat_failed(this.config.agentId, msg);
      this.logger.error('heartbeat_failed', { sequence: seq, error: msg });
    }
  }
}
