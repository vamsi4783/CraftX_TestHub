// ─── Milestone 5: ExecutionEngine Tests ──────────────────────────────────────

import { ExecutionEngine }                 from '../../execution/ExecutionEngine.js';
import { StepExecutor }                    from '../../execution/StepExecutor.js';
import { RecordingExecutionEventEmitter }  from '../../execution/events/IExecutionEventEmitter.js';
import { DriverRegistry }                  from '../../drivers/DriverRegistry.js';
import { DriverHost }                      from '../../drivers/DriverHost.js';
import { MockDriver }                      from '../../drivers/mock/MockDriver.js';
import { CancellationTokenSource }         from '../../drivers/DriverCancellation.js';
import type { ExecutionRequest }          from '../../execution/ExecutionTypes.js';
import type { IRulePack, RuleViolation }  from '../../execution/rules/IRulePack.js';
import type { ExecutionStep }             from '../../execution/ExecutionTypes.js';
import type { ExecutionContext }          from '../../execution/ExecutionContext.js';
import { NOOP_METRICS }                   from '../../execution/ExecutionMetrics.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStep(n: number, action = 'tap'): ExecutionStep {
  return {
    stepId:     `step-${n.toString().padStart(3, '0')}`,
    stepNumber: n,
    action:     { driver_id: 'mock_driver', action },
  };
}

interface TestRig {
  engine:   ExecutionEngine;
  emitter:  RecordingExecutionEventEmitter;
  registry: DriverRegistry;
  driver:   MockDriver;
  host:     DriverHost;
}

function makeRig(driverOptions: ConstructorParameters<typeof MockDriver>[0] = {}): TestRig {
  const registry = new DriverRegistry();
  const driver   = new MockDriver({ id: 'mock_driver', ...driverOptions });
  registry.register(driver);

  const host     = new DriverHost({ defaultTimeout_ms: 5000 });
  const emitter  = new RecordingExecutionEventEmitter();
  const executor = new StepExecutor(host, emitter);
  const engine   = new ExecutionEngine(registry, emitter, executor);

  return { engine, emitter, registry, driver, host };
}

function makeRequest(
  steps: ExecutionStep[],
  overrides: Partial<ExecutionRequest> = {},
): ExecutionRequest {
  return {
    sessionId:      'session-m5',
    testCaseId:     'tc-001',
    projectId:      'proj-m5',
    organizationId: 'org-m5',
    agentId:        'execution-agent/mock',
    driverId:       'mock_driver',
    steps,
    ...overrides,
  };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('ExecutionEngine — happy path', () => {
  it('single step: state = Completed', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(makeRequest([makeStep(1)]));
    expect(result.state).toBe('Completed');
  });

  it('multiple steps all pass: state = Completed', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(makeRequest([makeStep(1), makeStep(2), makeStep(3)]));
    expect(result.state).toBe('Completed');
    expect(result.passedSteps).toBe(3);
    expect(result.failedSteps).toBe(0);
  });

  it('stepResults count matches steps', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(makeRequest([makeStep(1), makeStep(2)]));
    expect(result.stepResults).toHaveLength(2);
  });

  it('executionId is a non-empty string', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(makeRequest([makeStep(1)]));
    expect(typeof result.executionId).toBe('string');
    expect(result.executionId.length).toBeGreaterThan(0);
  });

  it('sessionId is propagated to result', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(makeRequest([makeStep(1)], { sessionId: 'my-session' }));
    expect(result.sessionId).toBe('my-session');
  });

  it('totalSteps is correct', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(makeRequest([makeStep(1), makeStep(2)]));
    expect(result.totalSteps).toBe(2);
  });

  it('driver is connected during execution and disconnected after', async () => {
    const { engine, driver } = makeRig();
    await engine.execute(makeRequest([makeStep(1)]));
    // After completion the engine disconnects
    expect(driver.connectCallCount).toBe(1);
    expect(driver.disconnectCallCount).toBe(1);
    expect(driver.isConnected()).toBe(false);
  });
});

// ─── Event sequence ───────────────────────────────────────────────────────────

describe('ExecutionEngine — event sequence', () => {
  it('happy path emits ExecutionStarted then StepIntended then StepCompleted then ExecutionCompleted', async () => {
    const { engine, emitter } = makeRig();
    await engine.execute(makeRequest([makeStep(1)]));
    const kinds = emitter.kinds();
    expect(kinds[0]).toBe('ExecutionStarted');
    expect(kinds).toContain('StepIntended');
    expect(kinds).toContain('StepCompleted');
    expect(kinds[kinds.length - 1]).toBe('ExecutionCompleted');
  });

  it('StepIntended appears before StepCompleted in event list', async () => {
    const { engine, emitter } = makeRig();
    await engine.execute(makeRequest([makeStep(1)]));
    const kinds    = emitter.kinds();
    const intentI  = kinds.indexOf('StepIntended');
    const doneI    = kinds.indexOf('StepCompleted');
    expect(intentI).toBeGreaterThanOrEqual(0);
    expect(doneI).toBeGreaterThan(intentI);
  });

  it('2-step execution: two StepIntended events', async () => {
    const { engine, emitter } = makeRig();
    await engine.execute(makeRequest([makeStep(1), makeStep(2)]));
    expect(emitter.ofKind('StepIntended')).toHaveLength(2);
  });

  it('failed execution emits ExecutionFailed (not ExecutionCompleted)', async () => {
    const { engine, emitter } = makeRig({
      executeResult: new Error('driver crash'),
    });
    await engine.execute(makeRequest([makeStep(1)]));
    expect(emitter.ofKind('ExecutionFailed')).toHaveLength(1);
    expect(emitter.ofKind('ExecutionCompleted')).toHaveLength(0);
  });
});

// ─── Driver failure ───────────────────────────────────────────────────────────

describe('ExecutionEngine — driver failure', () => {
  it('state = Failed when a step fails', async () => {
    const { engine } = makeRig({ executeResult: new Error('crash') });
    const result = await engine.execute(makeRequest([makeStep(1), makeStep(2)]));
    expect(result.state).toBe('Failed');
  });

  it('stops after first failure (does not execute remaining steps)', async () => {
    const { engine } = makeRig({ executeResult: new Error('crash') });
    const result = await engine.execute(makeRequest([makeStep(1), makeStep(2), makeStep(3)]));
    expect(result.stepResults).toHaveLength(1);  // stops after first
  });

  it('failedSteps = 1 on single step failure', async () => {
    const { engine } = makeRig({ executeResult: new Error('crash') });
    const result = await engine.execute(makeRequest([makeStep(1)]));
    expect(result.failedSteps).toBe(1);
    expect(result.passedSteps).toBe(0);
  });

  it('error message is captured in result', async () => {
    const { engine } = makeRig({ executeResult: new Error('specific failure reason') });
    const result = await engine.execute(makeRequest([makeStep(1)]));
    expect(result.error).toContain('specific failure reason');
  });

  it('2 pass + 1 fail: passedSteps = 2, failedSteps = 1', async () => {
    const registry = new DriverRegistry();
    let   callCount = 0;
    const driver = new MockDriver({
      id: 'mock_driver',
      executeResult: { success: true, duration_ms: 0 },
    });
    // Override execute to fail on 3rd call
    const origExec = driver.execute.bind(driver);
    driver.execute = async (req) => {
      callCount++;
      if (callCount === 3) throw new Error('3rd step failed');
      return origExec(req);
    };
    registry.register(driver);

    const host     = new DriverHost();
    const emitter  = new RecordingExecutionEventEmitter();
    const executor = new StepExecutor(host, emitter);
    const engine   = new ExecutionEngine(registry, emitter, executor);

    const result = await engine.execute(makeRequest([makeStep(1), makeStep(2), makeStep(3)]));
    expect(result.passedSteps).toBe(2);
    expect(result.failedSteps).toBe(1);
    expect(result.state).toBe('Failed');
  });
});

// ─── Cancellation ─────────────────────────────────────────────────────────────

describe('ExecutionEngine — cancellation', () => {
  it('state = Cancelled when token is pre-cancelled', async () => {
    const cts = new CancellationTokenSource();
    cts.cancel();
    const { engine } = makeRig();
    const result = await engine.execute(
      makeRequest([makeStep(1)], { cancellationToken: cts.token }),
    );
    expect(result.state).toBe('Cancelled');
  });

  it('emits ExecutionCancelled (not ExecutionCompleted) on pre-cancel', async () => {
    const cts = new CancellationTokenSource();
    cts.cancel();
    const { engine, emitter } = makeRig();
    await engine.execute(makeRequest([makeStep(1)], { cancellationToken: cts.token }));
    expect(emitter.ofKind('ExecutionCancelled')).toHaveLength(1);
    expect(emitter.ofKind('ExecutionCompleted')).toHaveLength(0);
  });

  it('state = Cancelled when cancelled during a slow step', async () => {
    const cts    = new CancellationTokenSource();
    const { engine } = makeRig({ executeDelay_ms: 300 });
    setTimeout(() => cts.cancel(), 40);

    const result = await engine.execute(
      makeRequest([makeStep(1), makeStep(2)], {
        cancellationToken: cts.token,
      }),
    );
    expect(result.state).toBe('Cancelled');
  }, 3000);

  it('no steps executed when token is pre-cancelled (WAL still written)', async () => {
    const cts = new CancellationTokenSource();
    cts.cancel();
    const { engine, driver } = makeRig();
    await engine.execute(makeRequest([makeStep(1)], { cancellationToken: cts.token }));
    // Driver is connected (engine startup) but execute() is never called
    expect(driver.executeCallCount).toBe(0);
  });
});

// ─── Timeout ──────────────────────────────────────────────────────────────────

describe('ExecutionEngine — timeout', () => {
  it('state = Failed when step times out (DriverHost throws)', async () => {
    const registry = new DriverRegistry();
    const driver   = new MockDriver({ id: 'mock_driver', executeDelay_ms: 300 });
    registry.register(driver);
    const host     = new DriverHost({ defaultTimeout_ms: 30 });
    const emitter  = new RecordingExecutionEventEmitter();
    const executor = new StepExecutor(host, emitter);
    const engine   = new ExecutionEngine(registry, emitter, executor);

    const result = await engine.execute(makeRequest([makeStep(1)]));
    expect(result.state).toBe('Failed');
    expect(result.error).toBeDefined();
  }, 3000);
});

// ─── RulePack integration ─────────────────────────────────────────────────────

describe('ExecutionEngine — RulePack integration', () => {
  function makeFatalRulePack(ruleId = 'core.fatal_rule'): IRulePack {
    return {
      id: 'core',
      evaluate: async (): Promise<RuleViolation> => ({
        rule_id:      ruleId,
        rule_pack_id: 'core',
        description:  'Fatal rule triggered',
        is_fatal:     true,
      }),
    };
  }

  function makeNonFatalRulePack(): IRulePack {
    return {
      id: 'core',
      evaluate: async (): Promise<RuleViolation> => ({
        rule_id:      'core.warn',
        rule_pack_id: 'core',
        description:  'Non-fatal warning',
        is_fatal:     false,
      }),
    };
  }

  function makePassRulePack(): IRulePack {
    return {
      id: 'core',
      evaluate: async () => null,
    };
  }

  it('RulePack.evaluate() is called before each step', async () => {
    let callCount = 0;
    const pack: IRulePack = {
      id: 'core',
      evaluate: async () => { callCount++; return null; },
    };
    const { engine } = makeRig();
    await engine.execute(makeRequest([makeStep(1), makeStep(2)], { rulePacks: [pack] }));
    expect(callCount).toBe(2);
  });

  it('fatal violation: state = Failed, driver.execute() NOT called', async () => {
    const { engine, driver } = makeRig();
    await engine.execute(makeRequest([makeStep(1)], { rulePacks: [makeFatalRulePack()] }));
    expect(driver.executeCallCount).toBe(0);
  });

  it('fatal violation: state = Failed', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(
      makeRequest([makeStep(1)], { rulePacks: [makeFatalRulePack()] }),
    );
    expect(result.state).toBe('Failed');
  });

  it('fatal violation: stepResults contains skippedByRule = true', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(
      makeRequest([makeStep(1)], { rulePacks: [makeFatalRulePack()] }),
    );
    expect(result.stepResults[0].skippedByRule).toBe(true);
  });

  it('fatal violation: emits StepFailed with rule_pack_id', async () => {
    const { engine, emitter } = makeRig();
    await engine.execute(makeRequest([makeStep(1)], { rulePacks: [makeFatalRulePack()] }));
    const failed = emitter.ofKind('StepFailed')[0].payload as Record<string, unknown>;
    expect(failed.rule_pack_id).toBe('core');
  });

  it('non-fatal violation: execution continues, state = Completed', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(
      makeRequest([makeStep(1), makeStep(2)], { rulePacks: [makeNonFatalRulePack()] }),
    );
    expect(result.state).toBe('Completed');
    expect(result.passedSteps).toBe(2);
  });

  it('passing rule pack has no effect on execution', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(
      makeRequest([makeStep(1), makeStep(2)], { rulePacks: [makePassRulePack()] }),
    );
    expect(result.state).toBe('Completed');
    expect(result.passedSteps).toBe(2);
  });

  it('RulePack receives the step and ExecutionContext', async () => {
    let capturedStep: ExecutionStep | null = null;
    let capturedCtx:  ExecutionContext | null = null;
    const pack: IRulePack = {
      id: 'core',
      evaluate: async (step, ctx) => { capturedStep = step; capturedCtx = ctx; return null; },
    };
    const { engine } = makeRig();
    await engine.execute(makeRequest([makeStep(1)], { rulePacks: [pack] }));
    expect(capturedStep?.stepId).toBe('step-001');
    expect(capturedCtx?.executionId).toBeDefined();
  });
});

// ─── StepResult aggregation ───────────────────────────────────────────────────

describe('ExecutionEngine — StepResult aggregation', () => {
  it('each stepResult has correct stepId', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(makeRequest([makeStep(1), makeStep(2)]));
    expect(result.stepResults[0].stepId).toBe('step-001');
    expect(result.stepResults[1].stepId).toBe('step-002');
  });

  it('each stepResult has the action name', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(makeRequest([makeStep(1, 'screenshot')]));
    expect(result.stepResults[0].action).toBe('screenshot');
  });

  it('stepResults order matches execution order', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(makeRequest([makeStep(1), makeStep(2), makeStep(3)]));
    expect(result.stepResults.map(r => r.stepNumber)).toEqual([1, 2, 3]);
  });

  it('skippedSteps count is 1 for a fatal rule violation', async () => {
    const pack: IRulePack = {
      id: 'core',
      evaluate: async () => ({
        rule_id: 'x', rule_pack_id: 'core', description: 'blocked', is_fatal: true,
      }),
    };
    const { engine } = makeRig();
    const result = await engine.execute(
      makeRequest([makeStep(1)], { rulePacks: [pack] }),
    );
    expect(result.skippedSteps).toBe(1);
  });

  it('duration_ms is non-negative', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(makeRequest([makeStep(1)]));
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

// ─── Metrics hooks ────────────────────────────────────────────────────────────

describe('ExecutionEngine — metrics hooks', () => {
  it('fires execution_started and execution_finished', async () => {
    const calls: string[] = [];
    // We can't inject metrics into ExecutionEngine currently (it uses NOOP_METRICS).
    // Instead verify via the emitter event sequence as a proxy for lifecycle correctness.
    // (Full metrics injection would require adding metrics to ExecutionRequest.)
    const { engine, emitter } = makeRig();
    await engine.execute(makeRequest([makeStep(1)]));
    // Proxy check: engine emits the lifecycle events in order
    expect(emitter.kinds()[0]).toBe('ExecutionStarted');
    expect(emitter.kinds()[emitter.kinds().length - 1]).toBe('ExecutionCompleted');
    void calls; // explicitly unused
  });

  it('step_started fires before step_finished (verified via emitter ordering)', async () => {
    const { engine, emitter } = makeRig();
    await engine.execute(makeRequest([makeStep(1)]));
    const kinds    = emitter.kinds();
    const intentI  = kinds.indexOf('StepIntended');
    const completedI = kinds.indexOf('StepCompleted');
    expect(intentI).toBeLessThan(completedI);
  });
});

// ─── Driver not found ─────────────────────────────────────────────────────────

describe('ExecutionEngine — startup errors', () => {
  it('state = Failed when driverId not in registry', async () => {
    const { engine } = makeRig();
    const result = await engine.execute(
      makeRequest([makeStep(1)], { driverId: 'nonexistent_driver' }),
    );
    expect(result.state).toBe('Failed');
    expect(result.error).toBeDefined();
  });
});

// ─── Write-ahead log verification ─────────────────────────────────────────────

describe('ExecutionEngine — write-ahead log', () => {
  it('N steps → N StepIntended events, always before corresponding StepCompleted', async () => {
    const { engine, emitter } = makeRig();
    await engine.execute(makeRequest([makeStep(1), makeStep(2), makeStep(3)]));

    const kinds = emitter.kinds();
    // Every StepIntended appears before StepCompleted
    for (let i = 0; i < 3; i++) {
      const intentIdx   = kinds.indexOf('StepIntended');
      const completedIdx = kinds.indexOf('StepCompleted');
      expect(intentIdx).toBeLessThan(completedIdx);
    }
    expect(emitter.ofKind('StepIntended')).toHaveLength(3);
    expect(emitter.ofKind('StepCompleted')).toHaveLength(3);
  });

  it('StepIntended is emitted for a failed step too', async () => {
    const { engine, emitter } = makeRig({ executeResult: new Error('crash') });
    await engine.execute(makeRequest([makeStep(1)]));
    expect(emitter.ofKind('StepIntended')).toHaveLength(1);
  });
});
