// ─── Connector Diagnostics ────────────────────────────────────────────────────
// Assembles a full diagnostic report for any connector.
// Combines static connector metadata with live health and runtime stats.

import type { IAIConnector }           from '../core/IAIConnector';
import type { IAIProvider }            from '../core/IAIProvider';
import type { IAIAgent }               from '../core/IAIAgent';
import type { AIConnectorCapabilities, ConnectorHealth, ConnectorType } from '../types/AITypes';
import type { ConnectorStats }         from '../health/ConnectorHealthMonitor';
import type { ConnectorHealthMonitor } from '../health/ConnectorHealthMonitor';

// ─── Report shape ─────────────────────────────────────────────────────────────

export interface ConnectorDiagnosticReport {
  readonly connectorId:    string;
  readonly connectorName:  string;
  readonly version:        string;
  readonly type:           ConnectorType;
  readonly model?:         string;
  readonly endpoint?:      string;
  readonly agentTransport?: string;
  readonly latencyMs?:     number;
  readonly health:         ConnectorHealth;
  readonly capabilities:   AIConnectorCapabilities;
  readonly stats?:         ConnectorStats;
  readonly snapshotAt:     string;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Calls connector.health() and assembles a full diagnostic report.
 *
 * @param connector  Any registered IAIConnector.
 * @param monitor    Optional — attaches runtime stats if provided.
 */
export async function getDiagnostics(
  connector: IAIConnector,
  monitor?:  ConnectorHealthMonitor,
): Promise<ConnectorDiagnosticReport> {
  const health = await connector.health();

  const model    = isProvider(connector) ? connector.modelId : undefined;
  const transport = isAgent(connector) ? connector.mcpTransport : undefined;
  const version  = getVersion(connector);
  const stats    = monitor?.getStats(connector.id);

  return {
    connectorId:    connector.id,
    connectorName:  connector.name,
    version,
    type:           connector.type,
    model,
    agentTransport: transport,
    latencyMs:      health.latencyMs ?? stats?.latencyMsLast,
    health,
    capabilities:   connector.capabilities(),
    stats,
    snapshotAt:     new Date().toISOString(),
  };
}

/**
 * Gathers diagnostics for all connectors in a list (in parallel).
 */
export async function getAllDiagnostics(
  connectors: IAIConnector[],
  monitor?:   ConnectorHealthMonitor,
): Promise<ConnectorDiagnosticReport[]> {
  return Promise.all(connectors.map(c => getDiagnostics(c, monitor)));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isProvider(c: IAIConnector): c is IAIProvider & IAIConnector {
  return 'modelId' in c && 'providerName' in c;
}

function isAgent(c: IAIConnector): c is IAIAgent & IAIConnector {
  return 'agentName' in c;
}

function getVersion(c: IAIConnector): string {
  const ctor = (c as object).constructor as unknown as Record<string, unknown>;
  return typeof ctor['VERSION'] === 'string' ? ctor['VERSION'] : '1.0.0';
}

// ─── Summary formatter ────────────────────────────────────────────────────────

export function formatDiagnosticsSummary(report: ConnectorDiagnosticReport): string {
  const lines = [
    `Connector:    ${report.connectorName} (${report.connectorId})`,
    `Version:      ${report.version}`,
    `Type:         ${report.type}`,
  ];
  if (report.model)          lines.push(`Model:        ${report.model}`);
  if (report.agentTransport) lines.push(`Transport:    ${report.agentTransport}`);
  lines.push(
    `Health:       ${report.health.status}${report.latencyMs !== undefined ? ` (${report.latencyMs}ms)` : ''}`,
    `Capabilities: ${summariseCaps(report.capabilities)}`,
  );
  if (report.stats) {
    lines.push(
      `Requests:     ${report.stats.requestCount} (${Math.round(report.stats.availability * 100)}% success)`,
      `Avg latency:  ${report.stats.latencyMsAvg}ms`,
    );
  }
  return lines.join('\n');
}

function summariseCaps(caps: AIConnectorCapabilities): string {
  const flags: string[] = [];
  if (caps.supportsStreaming)    flags.push('streaming');
  if (caps.supportsVision)       flags.push('vision');
  if (caps.supportsJSON)         flags.push('json');
  if (caps.supportsTools)        flags.push('tools');
  if (caps.supportsReasoning)    flags.push('reasoning');
  if (caps.supportsLongContext)  flags.push('long-ctx');
  return flags.length ? flags.join(', ') : 'basic';
}
