import type { AITelemetryEvent } from '../types/AITypes';

export interface RetryConfig {
  readonly maxAttempts:       number;
  readonly initialDelayMs:    number;
  readonly backoffMultiplier: number;
  readonly maxDelayMs:        number;
}

export interface TelemetryHook {
  onEvent(event: AITelemetryEvent): void;
}

export interface OrchestratorConfig {
  readonly retry:              RetryConfig;
  readonly timeoutMs:          number;
  readonly requireHealthCheck: boolean;
  readonly fallbackEnabled:    boolean;
  readonly telemetryHooks?:    TelemetryHook[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts:       3,
  initialDelayMs:    1000,
  backoffMultiplier: 2,
  maxDelayMs:        10_000,
};

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  retry:              DEFAULT_RETRY_CONFIG,
  timeoutMs:          30_000,
  requireHealthCheck: false,
  fallbackEnabled:    true,
};
