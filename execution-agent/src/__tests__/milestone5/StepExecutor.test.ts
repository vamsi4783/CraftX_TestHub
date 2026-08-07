// ─── Milestone 5: StepExecutor Tests ─────────────────────────────────────────

import { StepExecutor }                    from '../../execution/StepExecutor.js';
import { RecordingExecutionEventEmitter }  from '../../execution/events/IExecutionEventEmitter.js';
import { DriverHost }                      from '../../drivers/DriverHost.js';
import { MockDriver }                      from '../../drivers/mock/MockDriver.js';
import { CancellationTokenSource,
         NON_CANCELLABLE }                 from '../../drivers/DriverCancellation.js';
import { StructuredLogger }                from '../../logging/StructuredLogger.js';
import { NOOP_METRICS }                    from '../../execution/ExecutionMetrics.js';
import type { ExecutionContext }           from '../../execution/ExecutionContext.js';
import type { ExecutionStep }             from '../../execution/ExecutionTypes.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    executionId:       'exec-m5',
    sessionId:         'sess-m5',
    projectId:         'proj-m5',
    organizationId:    'org-m5',
    agentId:           'execution-agent/mock',
    correlationId:     'sess-m5',
    currentStep:       1,
    totalSteps:        3,
    cancellationToken: NON_CANCELLABLE,
    logger:            new StructuredLogger('test'),
    metrics:           NOOP_METRICS,
    ...overrides,
  };
}

function makeStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  return {
    stepId:     'step-001',
    stepNumber: 1,
    action:     { driver_id: 'mock_driver', action: 'tap', params: { x: 100, y: 200 } },
    ...overrides,
  };
}

function makeExecutor(driver?: MockDriver) {
  const host     = new DriverHost();
  const emitter  = new RecordingExecutionEventEmitter();
  const executor = new StepExecutor(host, emitter);
  const d        = driver ?? new MockDriver({ startConnected: true });
  return { host, emitter, executor, driver: d };
}

// ─── WAL ordering ─────────────────────────────────────────────────────────────

describe('StepExecutor — Write-Ahead ordering', () => {
  it('emits StepIntended BEFORE driver.execute()', async () => {
    const callOrder: string[] = [];

    // Intercept emitter
    const emitter  = new RecordingExecutionEventEmitter();
    const _orig    = emitter.emitStepIntended.bind(emitter);
    emitter.emitStepIntended = async (p, ctx) => {
      callOrder.push('StepIntended');
      return _orig(p, ctx);
    };

    // Intercept driver
    const driver = new MockDriver({ startConnected: true });
    const _origExec = driver.execute.bind(driver);
    driver.execute = async (req) => {
      callOrder.push('driver.execute');
      return _origExec(req);
    };

    const executor = new StepExecutor(new DriverHost(), emitter);
    await executor.execute(driver, makeStep(), makeCtx());

    const intentIdx  = callOrder.indexOf('StepIntended');
    const executeIdx = callOrder.indexOf('driver.execute');
    expect(intentIdx).toBeGreaterThanOrEqual(0);
    expect(executeIdx).toBeGreaterThan(intentIdx);
  });

  it('emits StepIntended even when driver throws', async () => {
    const { emitter, executor, driver } = makeExecutor(
      new MockDriver({ startConnected: true, executeResult: new Error('crash') }),
    );
    await executor.execute(driver, makeStep(), makeCtx());
    expect(emitter.ofKind('StepIntended')).toHaveLength(1);
  });

  it('emits StepIntended with correct payload', async () => {
    const { emitter, executor, driver } = makeExecutor();
    const step = makeStep({ stepId: 'step-abc', stepNumber: 2 });
    await executor.execute(driver, step, makeCtx());

    const intent = emitter.ofKind('StepIntended')[0].payload as Record<string, unknown>;
    expect(intent.step_id).toBe('step-abc');
    expect(intent.step_number).toBe(2);
  });
});

// ─── Successful execution ─────────────────────────────────────────────────────

describe('StepExecutor — successful execution', () => {
  it('returns success: true when driver succeeds', async () => {
    const { executor, driver } = makeExecutor();
    const result = await executor.execute(driver, makeStep(), makeCtx());
    expect(result.success).toBe(true);
  });

  it('returns correct stepId and stepNumber', async () => {
    const { executor, driver } = makeExecutor();
    const step   = makeStep({ stepId: 'step-xyz', stepNumber: 3 });
    const result = await executor.execute(driver, step, makeCtx());
    expect(result.stepId).toBe('step-xyz');
    expect(result.stepNumber).toBe(3);
  });

  it('emits StepCompleted after success', async () => {
    const { emitter, executor, driver } = makeExecutor();
    await executor.execute(driver, makeStep(), makeCtx());
    expect(emitter.ofKind('StepCompleted')).toHaveLength(1);
  });

  it('does NOT emit StepFailed on success', async () => {
    const { emitter, executor, driver } = makeExecutor();
    await executor.execute(driver, makeStep(), makeCtx());
    expect(emitter.ofKind('StepFailed')).toHaveLength(0);
  });

  it('duration_ms is non-negative', async () => {
    const { executor, driver } = makeExecutor();
    const result = await executor.execute(driver, makeStep(), makeCtx());
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

// ─── Driver failure ───────────────────────────────────────────────────────────

describe('StepExecutor — driver failure', () => {
  it('returns success: false when driver throws', async () => {
    const { executor, driver } = makeExecutor(
      new MockDriver({ startConnected: true, executeResult: new Error('element missing') }),
    );
    const result = await executor.execute(driver, makeStep(), makeCtx());
    expect(result.success).toBe(false);
  });

  it('captures error message', async () => {
    const { executor, driver } = makeExecutor(
      new MockDriver({ startConnected: true, executeResult: new Error('boom') }),
    );
    const result = await executor.execute(driver, makeStep(), makeCtx());
    expect(result.error).toContain('boom');
  });

  it('emits StepFailed on driver error', async () => {
    const { emitter, executor, driver } = makeExecutor(
      new MockDriver({ startConnected: true, executeResult: new Error('crash') }),
    );
    await executor.execute(driver, makeStep(), makeCtx());
    expect(emitter.ofKind('StepFailed')).toHaveLength(1);
  });

  it('does NOT emit StepCompleted on driver error', async () => {
    const { emitter, executor, driver } = makeExecutor(
      new MockDriver({ startConnected: true, executeResult: new Error('crash') }),
    );
    await executor.execute(driver, makeStep(), makeCtx());
    expect(emitter.ofKind('StepCompleted')).toHaveLength(0);
  });

  it('StepFailed payload contains correct step_id', async () => {
    const { emitter, executor, driver } = makeExecutor(
      new MockDriver({ startConnected: true, executeResult: new Error('x') }),
    );
    const step = makeStep({ stepId: 'step-fail-001' });
    await executor.execute(driver, step, makeCtx());
    const failed = emitter.ofKind('StepFailed')[0].payload as Record<string, unknown>;
    expect(failed.step_id).toBe('step-fail-001');
  });
});

// ─── Cancellation propagation ─────────────────────────────────────────────────

describe('StepExecutor — cancellation', () => {
  it('returns success: false when cancelled during execution', async () => {
    const driver = new MockDriver({ startConnected: true, executeDelay_ms: 200 });
    const cts    = new CancellationTokenSource();
    const emitter  = new RecordingExecutionEventEmitter();
    const executor = new StepExecutor(new DriverHost({ defaultTimeout_ms: 5000 }), emitter);

    setTimeout(() => cts.cancel(), 30);

    const result = await executor.execute(
      driver, makeStep(), makeCtx({ cancellationToken: cts.token }),
    );
    expect(result.success).toBe(false);
    expect(emitter.ofKind('StepFailed')).toHaveLength(1);
  }, 2000);

  it('StepIntended is emitted before cancellation check', async () => {
    const driver = new MockDriver({ startConnected: true, executeDelay_ms: 200 });
    const cts    = new CancellationTokenSource();
    cts.cancel(); // pre-cancelled
    const emitter  = new RecordingExecutionEventEmitter();
    const executor = new StepExecutor(new DriverHost({ defaultTimeout_ms: 5000 }), emitter);

    await executor.execute(driver, makeStep(), makeCtx({ cancellationToken: cts.token }));
    // WAL write must have happened even though we were pre-cancelled
    expect(emitter.ofKind('StepIntended')).toHaveLength(1);
  });
});

// ─── Timeout ──────────────────────────────────────────────────────────────────

describe('StepExecutor — timeout', () => {
  it('returns success: false when driver times out', async () => {
    const driver = new MockDriver({ startConnected: true, executeDelay_ms: 300 });
    const emitter  = new RecordingExecutionEventEmitter();
    const executor = new StepExecutor(new DriverHost({ defaultTimeout_ms: 30 }), emitter);

    const result = await executor.execute(driver, makeStep(), makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  }, 2000);

  it('per-step timeout_ms is forwarded to DriverHost', async () => {
    const driver = new MockDriver({ startConnected: true, executeDelay_ms: 300 });
    const emitter  = new RecordingExecutionEventEmitter();
    const executor = new StepExecutor(new DriverHost({ defaultTimeout_ms: 5000 }), emitter);

    const step = makeStep({ timeout_ms: 30 });
    const result = await executor.execute(driver, step, makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  }, 2000);
});

// ─── Metrics hooks ────────────────────────────────────────────────────────────

describe('StepExecutor — metrics hooks', () => {
  it('fires step_started and step_finished on success', async () => {
    const calls: string[] = [];
    const metrics = {
      ...NOOP_METRICS,
      step_started:  () => { calls.push('step_started'); },
      step_finished: () => { calls.push('step_finished'); },
    };
    const { executor, driver } = makeExecutor();
    await executor.execute(driver, makeStep(), makeCtx({ metrics }));
    expect(calls).toEqual(['step_started', 'step_finished']);
  });

  it('fires step_finished even on failure', async () => {
    const calls: string[] = [];
    const metrics = {
      ...NOOP_METRICS,
      step_finished: () => { calls.push('step_finished'); },
    };
    const { executor, driver } = makeExecutor(
      new MockDriver({ startConnected: true, executeResult: new Error('x') }),
    );
    await executor.execute(driver, makeStep(), makeCtx({ metrics }));
    expect(calls).toContain('step_finished');
  });
});

// ─── Event sequencing ─────────────────────────────────────────────────────────

describe('StepExecutor — event sequence', () => {
  it('event order on success: StepIntended → StepCompleted', async () => {
    const { emitter, executor, driver } = makeExecutor();
    await executor.execute(driver, makeStep(), makeCtx());
    expect(emitter.kinds()).toEqual(['StepIntended', 'StepCompleted']);
  });

  it('event order on failure: StepIntended → StepFailed', async () => {
    const { emitter, executor, driver } = makeExecutor(
      new MockDriver({ startConnected: true, executeResult: new Error('x') }),
    );
    await executor.execute(driver, makeStep(), makeCtx());
    expect(emitter.kinds()).toEqual(['StepIntended', 'StepFailed']);
  });
});
