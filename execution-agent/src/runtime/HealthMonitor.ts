// ─── HealthMonitor ────────────────────────────────────────────────────────────
// Collects system and runtime health metrics on demand.
// Never throws — always returns a report; degrades gracefully on metric errors.

import os from 'os';
import type { DeviceInventory }           from './DeviceInventory.js';
import type { RuntimeMetricsHooks }       from './RuntimeMetrics.js';
import { NOOP_RUNTIME_METRICS }           from './RuntimeMetrics.js';
import type { HealthReport, HealthStatus } from './HealthReport.js';
import { StructuredLogger }                from '../logging/StructuredLogger.js';

// ─── System metrics abstraction ───────────────────────────────────────────────

/** Injectable — allows tests to supply deterministic values. */
export interface SystemMetricsProvider {
  /** Returns CPU usage of the current process, 0–100. */
  cpuPercent(): number;
  /** Returns process RSS in MB. */
  memoryUsedMb(): number;
  /** Returns total OS RAM in MB. */
  memoryTotalMb(): number;
}

/** Production provider — reads live Node.js / OS metrics. */
export function makeNodeSystemMetrics(): SystemMetricsProvider {
  let prevCpu = process.cpuUsage();
  let prevTime = Date.now();

  return {
    cpuPercent(): number {
      const now     = process.cpuUsage();
      const dtMs    = Date.now() - prevTime;
      const dtUs    = dtMs * 1000;
      const usedUs  = (now.user - prevCpu.user) + (now.system - prevCpu.system);
      prevCpu  = now;
      prevTime = Date.now();
      if (dtUs <= 0) return 0;
      return Math.min(100, Math.round((usedUs / dtUs) * 100));
    },
    memoryUsedMb(): number {
      return Math.round(process.memoryUsage().rss / (1024 * 1024));
    },
    memoryTotalMb(): number {
      return Math.round(os.totalmem() / (1024 * 1024));
    },
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

/** Execution-load fields read from the runtime at collection time. */
export interface HealthContext {
  activeExecutions: number;
  queueDepth:       number;
}

// ─── HealthMonitor ────────────────────────────────────────────────────────────

export class HealthMonitor {
  private readonly logger   = new StructuredLogger('HealthMonitor');
  private _lastReport: HealthReport | null = null;
  private readonly startedAt = Date.now();

  constructor(
    private readonly systemMetrics: SystemMetricsProvider,
    private readonly inventory:     DeviceInventory,
    private readonly metrics:       RuntimeMetricsHooks = NOOP_RUNTIME_METRICS,
    private readonly agentId:       string              = 'agent',
  ) {}

  /**
   * Collect a health report snapshot.
   * Never throws — errors in metric collection are captured in detail.
   */
  collect(ctx: HealthContext): HealthReport {
    const reportedAt = new Date().toISOString();
    const uptimeMs   = Date.now() - this.startedAt;

    let cpuPercent    = 0;
    let memoryUsedMb  = 0;
    let memoryTotalMb = 0;
    let detail: string | null = null;

    try {
      cpuPercent    = this.systemMetrics.cpuPercent();
      memoryUsedMb  = this.systemMetrics.memoryUsedMb();
      memoryTotalMb = this.systemMetrics.memoryTotalMb();
    } catch (err) {
      detail = `Metric collection error: ${String(err)}`;
      this.logger.warn('health_metric_error', { error: String(err) });
    }

    const connectedDrivers = this.inventory.allDrivers().length;
    const connectedDevices = this.inventory.available().length;
    const status           = this._computeStatus(cpuPercent, memoryUsedMb, memoryTotalMb, ctx);

    const report: HealthReport = {
      reportedAt,
      status,
      uptimeMs,
      cpuPercent,
      memoryUsedMb,
      memoryTotalMb,
      activeExecutions: ctx.activeExecutions,
      queueDepth:       ctx.queueDepth,
      connectedDrivers,
      connectedDevices,
      detail,
    };

    this._lastReport = report;
    this.metrics.health_checked(this.agentId, cpuPercent, memoryUsedMb);

    this.logger.info('health_collected', {
      status,
      cpu_percent:       cpuPercent,
      memory_used_mb:    memoryUsedMb,
      active_executions: ctx.activeExecutions,
      queue_depth:       ctx.queueDepth,
    });

    return report;
  }

  /** Returns the most recent report without collecting fresh data. */
  lastReport(): HealthReport | null {
    return this._lastReport;
  }

  private _computeStatus(
    cpuPercent:    number,
    memoryUsedMb:  number,
    memoryTotalMb: number,
    ctx:           HealthContext,
  ): HealthStatus {
    if (cpuPercent > 90) return 'unhealthy';
    if (memoryTotalMb > 0 && memoryUsedMb / memoryTotalMb > 0.9) return 'unhealthy';
    if (cpuPercent > 70 || ctx.activeExecutions > 10) return 'degraded';
    return 'healthy';
  }
}
