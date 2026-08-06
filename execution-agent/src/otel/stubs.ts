// ─── OpenTelemetry No-Op Stubs ───────────────────────────────────────────────
// Instrumentation points defined here; activated Phase 6.
// Every named span is declared so Phase 6 activation is a transport swap,
// not a code hunt.

export interface Span {
  end(): void;
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(error: Error): void;
}

const noopSpan: Span = {
  end: () => undefined,
  setAttribute: () => undefined,
  recordException: () => undefined,
};

export function startSpan(name: string, _attributes?: Record<string, unknown>): Span {
  void name;
  return noopSpan;
}

export function recordMetric(
  _name: string,
  _value: number,
  _attributes?: Record<string, unknown>,
): void {
  // no-op
}

// Named span constants — instrumentation points referenced throughout the engine.
// Phase 6: replace startSpan with real OTel SDK calls.
export const SPANS = {
  EXECUTION_SESSION:  'testhub.execution.session',
  EXECUTION_STEP:     'testhub.execution.step',
  DRIVER_EXECUTE:     'testhub.driver.execute',
  EVIDENCE_UPLOAD:    'testhub.evidence.upload',
  EVENT_STORE_APPEND: 'testhub.eventstore.append',
  RULE_EVALUATE:      'testhub.rule.evaluate',
} as const;
