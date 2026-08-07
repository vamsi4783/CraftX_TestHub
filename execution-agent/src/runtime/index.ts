// ─── Runtime barrel export ────────────────────────────────────────────────────

export { AgentRuntime }                              from './AgentRuntime.js';
export type { AgentRuntimeDeps }                     from './AgentRuntime.js';

export { AgentLifecycle, IllegalAgentTransitionError } from './AgentLifecycle.js';
export type { AgentState }                           from './AgentLifecycle.js';

export type { AgentStatus }                          from './AgentStatus.js';

export { DEFAULT_RUNTIME_CONFIG, buildRuntimeConfig } from './RuntimeConfiguration.js';
export type { RuntimeConfiguration, DiagnosticsLevel } from './RuntimeConfiguration.js';

export { NOOP_RUNTIME_METRICS }                      from './RuntimeMetrics.js';
export type { RuntimeMetricsHooks }                  from './RuntimeMetrics.js';

export { DeviceInventory, DeviceNotFoundError }      from './DeviceInventory.js';
export type { RegisteredDevice, DeviceKind, DeviceAvailability, DriverAvailability } from './DeviceInventory.js';

export { HealthMonitor, makeNodeSystemMetrics }      from './HealthMonitor.js';
export type { SystemMetricsProvider, HealthContext } from './HealthMonitor.js';

export type { HealthReport, HealthStatus }           from './HealthReport.js';

export { HeartbeatService, REAL_HEARTBEAT_TIMER }    from './HeartbeatService.js';
export type { HeartbeatEmitFn, HeartbeatTimer }      from './HeartbeatService.js';

export { RuntimeDiagnostics }                        from './RuntimeDiagnostics.js';
export type { BasicDiagnosticSnapshot, VerboseDiagnosticSnapshot, DiagnosticSnapshot } from './RuntimeDiagnostics.js';
