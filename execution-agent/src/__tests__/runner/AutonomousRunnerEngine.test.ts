// ─── AutonomousRunnerEngine Tests (Phase 4 M3) ───────────────────────────────

import { DriverRegistry }                 from '../../drivers/DriverRegistry.js';
import { DriverHost }                     from '../../drivers/DriverHost.js';
import { MockDriver }                     from '../../drivers/mock/MockDriver.js';
import { StepExecutor }                   from '../../execution/StepExecutor.js';
import { RecordingExecutionEventEmitter } from '../../execution/events/IExecutionEventEmitter.js';
import { AutonomousRunnerEngine }         from '../../runner/AutonomousRunnerEngine.js';
import { makePauseResumeSignal, DEFAULT_RUNNER_CONFIG } from '../../runner/AutonomousRunnerTypes.js';
import type { ExecutionStep }             from '../../execution/ExecutionTypes.js';
import type { RunnerConfig, PauseResumeSignal } from '../../runner/AutonomousRunnerTypes.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRig(driverOpts: ConstructorParameters<typeof MockDriver>[0] = {}) {
  const registry = new DriverRegistry();
  const driver   = new MockDriver({ id: 'mock', startConnected: false, ...driverOpts });
  registry.register(driver);
  const host     = new DriverHost({ defaultTimeout_ms: 5_000 });
  const emitter  = new RecordingExecutionEventEmitter();
  const executor = new StepExecutor(host, emitter);
  const engine   = new AutonomousRunnerEngine(registry, executor, emitter);
  return { registry, driver, host, emitter, executor, engine };
}

function makeStep(n: number, action = 'tap'): ExecutionStep {
  return {
    stepId:     `step-${String(n).padStart(3, '0')}`,
    stepNumber: n,
    action:     { driver_id: 'mock', action },
  };
}

function makeConfig(overrides: Partial<RunnerConfig> = {}): RunnerConfig {
  return { ...DEFAULT_RUNNER_CONFIG, ...overrides };
}

const SESSION = 'session-test';
const TC_ID   = 'tc-test';

// ─── Basic execution ──────────────────────────────────────────────────────────

describe('AutonomousRunnerEngine — basic execution', () => {
  it('completes a single passing step', async () => {
    const { engine } = makeRig({ startConnected: false });
    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)]);

    expect(report.state).toBe('Completed');
    expect(report.passedSteps).toBe(1);
    expect(report.failedSteps).toBe(0);
    expect(report.totalSteps).toBe(1);
  });

  it('completes three passing steps in order', async () => {
    const { engine } = makeRig();
    const steps = [makeStep(1), makeStep(2), makeStep(3)];
    const report = await engine.run(SESSION, TC_ID, 'mock', steps);

    expect(report.state).toBe('Completed');
    expect(report.passedSteps).toBe(3);
    expect(report.stepProgress.map(p => p.status)).toEqual(['passed', 'passed', 'passed']);
  });

  it('populates runId, sessionId, testCaseId in report', async () => {
    const { engine } = makeRig();
    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)]);

    expect(report.runId).toBeTruthy();
    expect(report.sessionId).toBe(SESSION);
    expect(report.testCaseId).toBe(TC_ID);
  });

  it('records duration_ms > 0', async () => {
    const { engine } = makeRig({ executeDelay_ms: 10 });
    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)]);
    expect(report.duration_ms).toBeGreaterThan(0);
  });

  it('emits ExecutionStarted and ExecutionCompleted events', async () => {
    const { engine, emitter } = makeRig();
    await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)]);

    const kinds = emitter.kinds();
    expect(kinds).toContain('ExecutionStarted');
    expect(kinds).toContain('ExecutionCompleted');
  });

  it('emits StepIntended and StepCompleted for each step', async () => {
    const { engine, emitter } = makeRig();
    await engine.run(SESSION, TC_ID, 'mock', [makeStep(1), makeStep(2)]);

    expect(emitter.ofKind('StepIntended')).toHaveLength(2);
    expect(emitter.ofKind('StepCompleted')).toHaveLength(2);
  });

  it('populates timeline events', async () => {
    const { engine } = makeRig();
    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)]);

    const kinds = report.timelineEvents.map(e => e.kind);
    expect(kinds).toContain('RunStarted');
    expect(kinds).toContain('StepStarted');
    expect(kinds).toContain('StepPassed');
    expect(kinds).toContain('RunCompleted');
  });

  it('returns empty report for empty step list', async () => {
    const { engine } = makeRig();
    const report = await engine.run(SESSION, TC_ID, 'mock', []);

    expect(report.state).toBe('Completed');
    expect(report.totalSteps).toBe(0);
    expect(report.passedSteps).toBe(0);
  });
});

// ─── Failure handling ─────────────────────────────────────────────────────────

describe('AutonomousRunnerEngine — failure handling', () => {
  it('stops on first failure by default (stopOnFailure=true)', async () => {
    const { engine } = makeRig({ executeResult: new Error('ADB error') });
    const steps = [makeStep(1), makeStep(2), makeStep(3)];
    const report = await engine.run(SESSION, TC_ID, 'mock', steps, makeConfig());

    expect(report.state).toBe('Failed');
    expect(report.failedSteps).toBe(1);
    expect(report.stepProgress[0].status).toBe('failed');
    expect(report.stepProgress[1].status).toBe('pending');
  });

  it('continues after failure when stopOnFailure=false', async () => {
    const { engine } = makeRig({ executeResult: new Error('minor error') });
    const steps = [makeStep(1), makeStep(2)];
    const report = await engine.run(SESSION, TC_ID, 'mock', steps,
      makeConfig({ stopOnFailure: false }));

    expect(report.state).toBe('Completed');
    expect(report.failedSteps).toBe(2);
  });

  it('sets error on failed step progress', async () => {
    const { engine } = makeRig({ executeResult: new Error('Tap failed') });
    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)]);

    expect(report.stepProgress[0].error).toContain('Tap failed');
  });

  it('emits StepFailed event', async () => {
    const { engine, emitter } = makeRig({ executeResult: new Error('fail') });
    await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)]);

    expect(emitter.ofKind('StepFailed')).toHaveLength(1);
  });

  it('emits ExecutionFailed when stopOnFailure=true', async () => {
    const { engine, emitter } = makeRig({ executeResult: new Error('fail') });
    await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)]);

    expect(emitter.ofKind('ExecutionFailed')).toHaveLength(1);
  });

  it('fails gracefully when driver cannot be resolved', async () => {
    const { engine } = makeRig();
    const report = await engine.run(SESSION, TC_ID, 'nonexistent_driver', [makeStep(1)]);

    expect(report.state).toBe('Failed');
    expect(report.error).toBeTruthy();
  });
});

// ─── Retry ────────────────────────────────────────────────────────────────────

describe('AutonomousRunnerEngine — retry', () => {
  it('retries up to maxRetries times then marks step failed', async () => {
    const { engine } = makeRig({ executeResult: new Error('retry me') });
    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)],
      makeConfig({ maxRetries: 2, retryDelayMs: 0 }));

    expect(report.stepProgress[0].retryCount).toBe(2);
    expect(report.stepProgress[0].status).toBe('failed');
  });

  it('passes on second attempt when retries available', async () => {
    // First call fails, subsequent calls pass
    let callCount = 0;
    const registry = new DriverRegistry();
    const host     = new DriverHost({ defaultTimeout_ms: 5_000 });
    const emitter  = new RecordingExecutionEventEmitter();

    const driver = new MockDriver({
      id: 'mock',
      startConnected: false,
      get executeResult() {
        callCount++;
        return callCount === 1
          ? new Error('first attempt fails')
          : { success: true, duration_ms: 0 };
      },
    });
    registry.register(driver);
    const executor = new StepExecutor(host, emitter);
    const engine   = new AutonomousRunnerEngine(registry, executor, emitter);

    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)],
      makeConfig({ maxRetries: 1, retryDelayMs: 0 }));

    expect(report.stepProgress[0].retryCount).toBe(1);
    expect(report.stepProgress[0].status).toBe('passed');
  });
});

// ─── FullyAuto mode ───────────────────────────────────────────────────────────

describe('AutonomousRunnerEngine — FullyAuto mode', () => {
  it('runs all steps without interruption', async () => {
    const { engine } = makeRig();
    const steps = [makeStep(1), makeStep(2), makeStep(3), makeStep(4), makeStep(5)];
    const report = await engine.run(SESSION, TC_ID, 'mock', steps,
      makeConfig({ mode: 'FullyAuto' }));

    expect(report.state).toBe('Completed');
    expect(report.passedSteps).toBe(5);
  });
});

// ─── Manual mode ─────────────────────────────────────────────────────────────

describe('AutonomousRunnerEngine — Manual mode', () => {
  it('pauses before each step and resumes on signal', async () => {
    const { engine } = makeRig();
    const signal = makePauseResumeSignal();
    const steps  = [makeStep(1), makeStep(2)];

    // Auto-confirm each pause after 10ms
    const confirmLoop = setInterval(() => {
      signal.resumeConfirmed = true;
    }, 10);

    const report = await engine.run(SESSION, TC_ID, 'mock', steps,
      makeConfig({ mode: 'Manual' }), signal);

    clearInterval(confirmLoop);

    expect(report.state).toBe('Completed');
    expect(report.passedSteps).toBe(2);
    const pauseEvents = report.timelineEvents.filter(e => e.kind === 'PausedBeforeStep');
    expect(pauseEvents).toHaveLength(2);
  });
});

// ─── SemiAuto mode ────────────────────────────────────────────────────────────

describe('AutonomousRunnerEngine — SemiAuto mode', () => {
  it('pauses on failure and skips step on user decision', async () => {
    let calls = 0;
    const registry = new DriverRegistry();
    const host     = new DriverHost({ defaultTimeout_ms: 5_000 });
    const emitter  = new RecordingExecutionEventEmitter();
    const driver   = new MockDriver({
      id: 'mock', startConnected: false,
      get executeResult() {
        calls++;
        return calls === 1
          ? new Error('step 1 fails')
          : { success: true, duration_ms: 0 };
      },
    });
    registry.register(driver);
    const executor = new StepExecutor(host, emitter);
    const engine   = new AutonomousRunnerEngine(registry, executor, emitter);

    const signal = makePauseResumeSignal();
    const steps  = [makeStep(1), makeStep(2)];

    // After 20ms decide to skip the failed step
    setTimeout(() => { signal.failureDecision = 'skip'; }, 20);

    const report = await engine.run(SESSION, TC_ID, 'mock', steps,
      makeConfig({ mode: 'SemiAuto' }), signal);

    expect(report.state).toBe('Completed');
    expect(report.stepProgress[0].status).toBe('skipped');
    expect(report.stepProgress[1].status).toBe('passed');
  });

  it('aborts run when user decides abort on failure', async () => {
    const { engine } = makeRig({ executeResult: new Error('fail') });
    const signal = makePauseResumeSignal();

    setTimeout(() => { signal.failureDecision = 'abort'; }, 20);

    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1), makeStep(2)],
      makeConfig({ mode: 'SemiAuto' }), signal);

    expect(report.state).toBe('Cancelled');
    expect(report.cancelReason).toBeTruthy();
  });
});

// ─── Pause mid-run (SemiAuto / FullyAuto) ─────────────────────────────────────

describe('AutonomousRunnerEngine — user-triggered pause', () => {
  it('pauses between steps and resumes', async () => {
    const { engine } = makeRig({ executeDelay_ms: 0 });
    const signal = makePauseResumeSignal();
    const steps  = [makeStep(1), makeStep(2), makeStep(3)];

    // Request pause before step 2, auto-resume after 20ms
    setTimeout(() => {
      signal.pauseRequested = true;
      setTimeout(() => { signal.resumeConfirmed = true; }, 20);
    }, 5);

    const report = await engine.run(SESSION, TC_ID, 'mock', steps,
      makeConfig({ mode: 'FullyAuto' }), signal);

    expect(report.state).toBe('Completed');
    expect(report.passedSteps).toBe(3);
    const pauseEvents = report.timelineEvents.filter(e => e.kind === 'PausedBeforeStep');
    expect(pauseEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── MockDriver integration ───────────────────────────────────────────────────

describe('AutonomousRunnerEngine — MockDriver integration', () => {
  it('driver connect/disconnect is called exactly once per run', async () => {
    const { engine, driver } = makeRig();
    await engine.run(SESSION, TC_ID, 'mock', [makeStep(1), makeStep(2)]);

    expect(driver.connectCallCount).toBe(1);
    expect(driver.disconnectCallCount).toBe(1);
  });

  it('driver.execute is called once per step', async () => {
    const { engine, driver } = makeRig();
    await engine.run(SESSION, TC_ID, 'mock', [makeStep(1), makeStep(2), makeStep(3)]);
    expect(driver.executeCallCount).toBe(3);
  });

  it('driver.execute receives correct action per step', async () => {
    const { engine, driver } = makeRig();
    const steps = [makeStep(1, 'tap'), makeStep(2, 'swipe'), makeStep(3, 'type_text')];
    await engine.run(SESSION, TC_ID, 'mock', steps);

    const actions = driver.executeHistory.map(r => r.action);
    expect(actions).toEqual(['tap', 'swipe', 'type_text']);
  });

  it('disconnect still called even after driver error during execution', async () => {
    const { engine, driver } = makeRig({ executeResult: new Error('crash') });
    await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)]);
    expect(driver.disconnectCallCount).toBe(1);
  });
});

// ─── Report completeness ──────────────────────────────────────────────────────

describe('AutonomousRunnerEngine — report', () => {
  it('report has completedAt set after run', async () => {
    const { engine } = makeRig();
    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)]);
    expect(report.completedAt).toBeTruthy();
  });

  it('step progress has startedAt and completedAt', async () => {
    const { engine } = makeRig();
    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)]);
    expect(report.stepProgress[0].startedAt).toBeTruthy();
    expect(report.stepProgress[0].completedAt).toBeTruthy();
  });

  it('mode is correctly recorded in report', async () => {
    const { engine } = makeRig();
    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1)],
      makeConfig({ mode: 'SemiAuto' }));
    expect(report.mode).toBe('SemiAuto');
  });

  it('timeline event offsetMs values are non-negative', async () => {
    const { engine } = makeRig();
    const report = await engine.run(SESSION, TC_ID, 'mock', [makeStep(1), makeStep(2)]);
    for (const ev of report.timelineEvents) {
      expect(ev.offsetMs).toBeGreaterThanOrEqual(0);
    }
  });
});
