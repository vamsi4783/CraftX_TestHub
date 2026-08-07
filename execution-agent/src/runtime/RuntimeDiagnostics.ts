// ─── RuntimeDiagnostics ───────────────────────────────────────────────────────
// Snapshot APIs for runtime introspection. No UI — callers consume the objects.
// DiagnosticsLevel controls how much detail is included.

import type { AgentState }          from './AgentLifecycle.js';
import type { AgentStatus }         from './AgentStatus.js';
import type { HealthReport }        from './HealthReport.js';
import type { DeviceInventory }     from './DeviceInventory.js';
import type { DiagnosticsLevel }    from './RuntimeConfiguration.js';

export interface BasicDiagnosticSnapshot {
  readonly snapshotAt:    string;     // ISO8601Z
  readonly agentId:       string;
  readonly agentVersion:  string;
  readonly state:         AgentState;
  readonly uptimeMs:      number;
  readonly healthStatus:  string;
}

export interface VerboseDiagnosticSnapshot extends BasicDiagnosticSnapshot {
  readonly agentStatus:   AgentStatus;
  readonly lastHealth:    HealthReport | null;
  readonly deviceCount:   number;
  readonly driverCount:   number;
  readonly devices:       Array<{
    deviceId:     string;
    kind:         string;
    driverId:     string;
    availability: string;
  }>;
}

export type DiagnosticSnapshot = BasicDiagnosticSnapshot | VerboseDiagnosticSnapshot;

export class RuntimeDiagnostics {
  constructor(
    private readonly agentId:      string,
    private readonly agentVersion: string,
    private readonly getStatus:    () => AgentStatus,
    private readonly getHealth:    () => HealthReport | null,
    private readonly inventory:    DeviceInventory,
    private readonly level:        DiagnosticsLevel,
  ) {}

  snapshot(): DiagnosticSnapshot {
    const status    = this.getStatus();
    const health    = this.getHealth();
    const snapshotAt = new Date().toISOString();

    const basic: BasicDiagnosticSnapshot = {
      snapshotAt,
      agentId:       this.agentId,
      agentVersion:  this.agentVersion,
      state:         status.state,
      uptimeMs:      status.uptimeMs,
      healthStatus:  health?.status ?? 'unknown',
    };

    if (this.level === 'verbose') {
      const verbose: VerboseDiagnosticSnapshot = {
        ...basic,
        agentStatus: status,
        lastHealth:  health,
        deviceCount: this.inventory.count(),
        driverCount: this.inventory.allDrivers().length,
        devices: this.inventory.all().map(d => ({
          deviceId:     d.deviceId,
          kind:         d.kind,
          driverId:     d.driverId,
          availability: d.availability,
        })),
      };
      return verbose;
    }

    return basic;
  }
}
