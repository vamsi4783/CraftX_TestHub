// ─── RuntimeConfiguration ─────────────────────────────────────────────────────
// Immutable configuration snapshot for AgentRuntime.
// Loaded at startup — no runtime mutations.

import type { LogLevel } from '../logging/StructuredLogger.js';

export type DiagnosticsLevel = 'none' | 'basic' | 'verbose';

export interface RuntimeConfiguration {
  /** Agent identifier — unique per runtime instance. */
  agentId:             string;
  /** Agent version string. */
  agentVersion:        string;
  /** Organisation id this agent belongs to. */
  organizationId:      string;
  /** Interval between heartbeat emissions (ms). Default: 5000. */
  heartbeatIntervalMs: number;
  /** Controls how much diagnostic detail snapshot APIs expose. */
  diagnosticsLevel:    DiagnosticsLevel;
  /** Minimum log level emitted to stdout. */
  logLevel:            LogLevel;
  /** Enable/disable runtime metrics hooks. */
  metricsEnabled:      boolean;
  /** Enable/disable health monitor collection. */
  healthEnabled:       boolean;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfiguration = {
  agentId:             'agent-default',
  agentVersion:        '1.0.0',
  organizationId:      'org-default',
  heartbeatIntervalMs: 5_000,
  diagnosticsLevel:    'basic',
  logLevel:            'info',
  metricsEnabled:      true,
  healthEnabled:       true,
};

/** Merge partial overrides on top of the defaults. */
export function buildRuntimeConfig(
  overrides: Partial<RuntimeConfiguration>,
): RuntimeConfiguration {
  return { ...DEFAULT_RUNTIME_CONFIG, ...overrides };
}
