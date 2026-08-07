// ─── AgentRuntime ─────────────────────────────────────────────────────────────
// Owns the agent lifecycle, wires up subsystems, and orchestrates
// startup/shutdown. No WebSocket, no UI integration in Phase 3.

import { AgentLifecycle }       from './AgentLifecycle.js';
import { HealthMonitor }        from './HealthMonitor.js';
import { HeartbeatService }     from './HeartbeatService.js';
import { DeviceInventory }      from './DeviceInventory.js';
import { RuntimeDiagnostics }   from './RuntimeDiagnostics.js';
import { NOOP_RUNTIME_METRICS } from './RuntimeMetrics.js';
import type { AgentStatus }     from './AgentStatus.js';
import type { HealthReport }    from './HealthReport.js';
import type { RuntimeConfiguration } from './RuntimeConfiguration.js';
import type { RuntimeMetricsHooks }  from './RuntimeMetrics.js';
import type { SystemMetricsProvider } from './HealthMonitor.js';
import type { HeartbeatTimer, HeartbeatEmitFn } from './HeartbeatService.js';
import type { DiagnosticSnapshot }   from './RuntimeDiagnostics.js';
import { StructuredLogger }          from '../logging/StructuredLogger.js';

export interface AgentRuntimeDeps {
  systemMetrics: SystemMetricsProvider;
  heartbeatEmit: HeartbeatEmitFn;
  heartbeatTimer?: HeartbeatTimer;
  metrics?:        RuntimeMetricsHooks;
}

export class AgentRuntime {
  private readonly logger    = new StructuredLogger('AgentRuntime');
  private readonly lifecycle = new AgentLifecycle();
  private readonly inventory = new DeviceInventory();
  private readonly monitor:  HealthMonitor;
  private readonly heartbeat: HeartbeatService;
  private readonly diagnostics: RuntimeDiagnostics;
  private readonly metrics: RuntimeMetricsHooks;
  private _startedAt: number | null   = null;
  private _stoppedAt: number | null   = null;
  private _faultReason: string | null = null;

  constructor(
    private readonly config: RuntimeConfiguration,
    deps: AgentRuntimeDeps,
  ) {
    this.metrics = deps.metrics ?? NOOP_RUNTIME_METRICS;

    this.monitor = new HealthMonitor(
      deps.systemMetrics,
      this.inventory,
      this.metrics,
      config.agentId,
    );

    this.heartbeat = new HeartbeatService(
      config,
      deps.heartbeatEmit,
      this.monitor,
      this.inventory,
      deps.heartbeatTimer,
      this.metrics,
    );

    this.diagnostics = new RuntimeDiagnostics(
      config.agentId,
      config.agentVersion,
      () => this.status(),
      () => this.monitor.lastReport(),
      this.inventory,
      config.diagnosticsLevel,
    );
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.lifecycle.transition('Starting');
    this.logger.info('agent_starting', { agent_id: this.config.agentId });

    try {
      this._startedAt = Date.now();

      if (this.config.healthEnabled) {
        // Collect an initial health report to populate lastReport()
        this.monitor.collect({ activeExecutions: 0, queueDepth: 0 });
      }

      this.lifecycle.transition('Running');

      if (this.config.heartbeatIntervalMs > 0) {
        this.heartbeat.start();
      }

      this.metrics.runtime_started(this.config.agentId);
      this.logger.info('agent_started', { agent_id: this.config.agentId });

    } catch (err) {
      this._faultReason = err instanceof Error ? err.message : String(err);
      this.lifecycle.transition('Faulted');
      this.logger.error('agent_start_failed', {
        agent_id: this.config.agentId,
        error:    this._faultReason,
      });
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.lifecycle.isTerminal()) return;

    this.lifecycle.transition('Stopping');
    this.logger.info('agent_stopping', { agent_id: this.config.agentId });

    try {
      this.heartbeat.stop();
      this._stoppedAt = Date.now();
      this.lifecycle.transition('Stopped');

      const uptimeMs = this._startedAt ? Date.now() - this._startedAt : 0;
      this.metrics.runtime_stopped(this.config.agentId, uptimeMs);
      this.logger.info('agent_stopped', { agent_id: this.config.agentId, uptime_ms: uptimeMs });

    } catch (err) {
      this._faultReason = err instanceof Error ? err.message : String(err);
      this.lifecycle.transition('Faulted');
      this.logger.error('agent_stop_failed', {
        agent_id: this.config.agentId,
        error:    this._faultReason,
      });
      throw err;
    }
  }

  fault(reason: string): void {
    if (this.lifecycle.isTerminal()) return;
    this._faultReason = reason;
    this.lifecycle.transition('Faulted');
    this.heartbeat.stop();
    this.logger.error('agent_faulted', { agent_id: this.config.agentId, reason });
  }

  // ─── Health ──────────────────────────────────────────────────────────────────

  collectHealth(activeExecutions = 0, queueDepth = 0): HealthReport {
    return this.monitor.collect({ activeExecutions, queueDepth });
  }

  lastHealth(): HealthReport | null {
    return this.monitor.lastReport();
  }

  // ─── Status ──────────────────────────────────────────────────────────────────

  status(): AgentStatus {
    const now = Date.now();
    return {
      agentId:      this.config.agentId,
      agentVersion: this.config.agentVersion,
      state:        this.lifecycle.state,
      startedAt:    this._startedAt ? new Date(this._startedAt).toISOString() : null,
      stoppedAt:    this._stoppedAt ? new Date(this._stoppedAt).toISOString() : null,
      uptimeMs:     this._startedAt && !this._stoppedAt ? now - this._startedAt : 0,
      faultReason:  this._faultReason,
    };
  }

  // ─── Diagnostics ─────────────────────────────────────────────────────────────

  snapshot(): DiagnosticSnapshot {
    return this.diagnostics.snapshot();
  }

  // ─── Inventory ───────────────────────────────────────────────────────────────

  get deviceInventory(): DeviceInventory {
    return this.inventory;
  }

  // ─── Heartbeat access (for tests) ────────────────────────────────────────────

  get heartbeatService(): HeartbeatService {
    return this.heartbeat;
  }
}
