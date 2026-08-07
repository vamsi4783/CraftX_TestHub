// ─── RuntimeMetrics ───────────────────────────────────────────────────────────
// Hooks fired by AgentRuntime and HeartbeatService.
// All implementations must be synchronous and non-throwing.

export interface RuntimeMetricsHooks {
  runtime_started(agentId: string): void;
  runtime_stopped(agentId: string, uptimeMs: number): void;
  heartbeat_sent(agentId: string, sequenceNumber: number): void;
  heartbeat_failed(agentId: string, error: string): void;
  health_checked(agentId: string, cpuPercent: number, memoryMb: number): void;
}

export const NOOP_RUNTIME_METRICS: RuntimeMetricsHooks = {
  runtime_started:  () => undefined,
  runtime_stopped:  () => undefined,
  heartbeat_sent:   () => undefined,
  heartbeat_failed: () => undefined,
  health_checked:   () => undefined,
};
