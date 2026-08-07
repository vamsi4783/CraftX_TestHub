// ─── HealthReport ─────────────────────────────────────────────────────────────
// Point-in-time snapshot returned by HealthMonitor.collect().

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthReport {
  readonly reportedAt:       string;    // ISO8601Z
  readonly status:           HealthStatus;
  readonly uptimeMs:         number;
  // Resource usage
  readonly cpuPercent:       number;    // process CPU, 0–100
  readonly memoryUsedMb:     number;    // process RSS
  readonly memoryTotalMb:    number;    // OS total RAM
  // Execution load
  readonly activeExecutions: number;
  readonly queueDepth:       number;    // evidence upload queue depth
  // Connectivity
  readonly connectedDrivers: number;
  readonly connectedDevices: number;
  // Optional detail string
  readonly detail:           string | null;
}
