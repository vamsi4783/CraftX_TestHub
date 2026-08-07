import type { AITelemetryEvent } from '../types/AITypes';

// ─── Telemetry interface ──────────────────────────────────────────────────────

export interface IAITelemetry {
  record(event: AITelemetryEvent): void;
  flush(): Promise<void>;
  getEvents(): readonly AITelemetryEvent[];
}

// ─── No-op implementation (default / test) ────────────────────────────────────

export class NoOpTelemetry implements IAITelemetry {
  record(_event: AITelemetryEvent): void {}
  async flush(): Promise<void> {}
  getEvents(): readonly AITelemetryEvent[] { return []; }
}

// ─── In-memory implementation (useful for tests and debugging) ────────────────

export class InMemoryTelemetry implements IAITelemetry {
  private readonly _events: AITelemetryEvent[] = [];

  record(event: AITelemetryEvent): void {
    this._events.push(event);
  }

  async flush(): Promise<void> {
    this._events.length = 0;
  }

  getEvents(): readonly AITelemetryEvent[] {
    return [...this._events];
  }

  /** Returns all events of a given type. */
  eventsOfType(type: AITelemetryEvent['eventType']): readonly AITelemetryEvent[] {
    return this._events.filter(e => e.eventType === type);
  }
}
