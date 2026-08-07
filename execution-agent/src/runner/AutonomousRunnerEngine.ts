// ─── AutonomousRunnerEngine (Phase 4 M3) ─────────────────────────────────────
// Step-by-step runner that wraps StepExecutor directly so it can pause/resume
// between steps without modifying the frozen ExecutionEngine.
//
// Rules:
// - Uses StepExecutor (not ExecutionEngine) to gain per-step control.
// - Uses IExecutionEventEmitter unchanged.
// - Does NOT modify DriverHost, DriverRegistry, EventBus, or ExecutionEngine.
// - Pause/resume is implemented via PauseResumeSignal — a shared mutable object.

import { uuidv7 }                       from 'uuidv7';
import { StructuredLogger }             from '../logging/StructuredLogger.js';
import type { DriverRegistry }          from '../drivers/DriverRegistry.js';
import type { StepExecutor }           from '../execution/StepExecutor.js';
import type { IExecutionEventEmitter } from '../execution/events/IExecutionEventEmitter.js';
import type { ExecutionStep }          from '../execution/ExecutionTypes.js';
import type { ExecutionContext }        from '../execution/ExecutionContext.js';
import { NOOP_METRICS }                from '../execution/ExecutionMetrics.js';
import { CancellationTokenSource }     from '../drivers/DriverCancellation.js';
import { AssertionEngine }             from '../assertions/AssertionEngine.js';
import { AssertionRegistry }           from '../assertions/AssertionRegistry.js';
import type { AssertionParams }        from '../assertions/AssertionTypes.js';
import {
  DEFAULT_RUNNER_CONFIG,
  makePauseResumeSignal,
} from './AutonomousRunnerTypes.js';
import type {
  RunnerConfig,
  RunnerState,
  StepProgress,
  StepRunStatus,
  RunnerReport,
  RunnerTimelineEvent,
  RunnerTimelineEventKind,
  PauseResumeSignal,
} from './AutonomousRunnerTypes.js';
import type { ISelfHealingPlugin } from '../healing/HealingTypes.js';

// ─── AutonomousRunnerEngine ───────────────────────────────────────────────────

export class AutonomousRunnerEngine {
  private readonly logger          = new StructuredLogger('AutonomousRunnerEngine');
  private readonly assertionEngine: AssertionEngine;

  constructor(
    private readonly driverRegistry:   DriverRegistry,
    private readonly stepExecutor:     StepExecutor,
    private readonly emitter:          IExecutionEventEmitter,
    /** Optional custom registry — defaults to the standard built-in registry. */
    assertionRegistry?:                AssertionRegistry,
    /** Optional self-healing plugin — injected to avoid direct coupling. */
    private readonly healingPlugin?:   ISelfHealingPlugin,
  ) {
    this.assertionEngine = new AssertionEngine(assertionRegistry ?? new AssertionRegistry());
  }

  /**
   * Execute steps one-by-one with full pause/resume/cancel/retry support.
   *
   * @param sessionId    Correlates all events for this run.
   * @param testCaseId   Source test case.
   * @param driverId     Must be registered in DriverRegistry.
   * @param steps        Steps to execute, in order.
   * @param config       Runner configuration (mode, retry, stopOnFailure).
   * @param signal       Caller-held pause/resume signal object.
   * @param driverConfig Optional driver connection config.
   */
  async run(
    sessionId:    string,
    testCaseId:   string,
    driverId:     string,
    steps:        ExecutionStep[],
    config:       RunnerConfig = DEFAULT_RUNNER_CONFIG,
    signal:       PauseResumeSignal = makePauseResumeSignal(),
    driverConfig: Record<string, unknown> = {},
  ): Promise<RunnerReport> {
    const runId     = uuidv7();
    const startedAt = new Date().toISOString();
    const t0        = Date.now();
    const cts       = new CancellationTokenSource();

    const timelineEvents: RunnerTimelineEvent[] = [];
    const stepProgress:   StepProgress[]        = steps.map(s => ({
      stepId:      s.stepId,
      stepNumber:  s.stepNumber,
      action:      s.action.action,
      driverId:    s.action.driver_id,
      status:      'pending' as StepRunStatus,
      duration_ms: 0,
      retryCount:  0,
      evidenceIds: [],
    }));

    const addEvent = (
      kind:       RunnerTimelineEventKind,
      message:    string,
      stepId?:    string,
      stepNumber?: number,
      metadata?:  Record<string, unknown>,
    ): void => {
      timelineEvents.push({
        id:         uuidv7(),
        kind,
        stepId,
        stepNumber,
        offsetMs:   Date.now() - t0,
        message,
        metadata,
      });
    };

    const ctx: ExecutionContext = {
      executionId:      runId,
      sessionId,
      projectId:        '',
      organizationId:   '',
      agentId:          'autonomous-runner',
      correlationId:    sessionId,
      currentStep:      0,
      totalSteps:       steps.length,
      cancellationToken: cts.token,
      logger:           new StructuredLogger(`Runner:${runId.slice(0, 8)}`),
      metrics:          NOOP_METRICS,
    };

    let runnerState: RunnerState = 'Running';
    let cancelReason             = '';
    let runError                 = '';

    // ── Connect driver ───────────────────────────────────────────────────────
    let driver;
    try {
      driver = this.driverRegistry.resolve(driverId);
      if (driver.initialize) await driver.initialize();
      await driver.connect(driverConfig);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addEvent('RunFailed', `Driver connect failed: ${error}`);
      return this._makeReport(runId, sessionId, testCaseId, 'Failed', config.mode,
        steps.length, 0, 0, 0, Date.now() - t0, stepProgress, startedAt, error, '', 0, timelineEvents);
    }

    await this.emitter.emitExecutionStarted(
      { session_id: sessionId, test_case_id: testCaseId, driver_id: driverId, total_steps: steps.length },
      ctx,
    );
    addEvent('RunStarted', `Run started — ${steps.length} step(s), mode: ${config.mode}`);

    // ── Step loop ────────────────────────────────────────────────────────────
    for (let i = 0; i < steps.length; i++) {
      const step   = steps[i];
      const prog   = stepProgress[i];
      ctx.currentStep = step.stepNumber;

      // ── Cancellation check ───────────────────────────────────────────────
      if (cts.token.isCancelled) {
        runnerState  = 'Cancelled';
        cancelReason = 'Cancelled before step';
        prog.status  = 'skipped';
        addEvent('Cancelled', 'Run cancelled', step.stepId, step.stepNumber);
        break;
      }

      // ── Manual mode: pause before every step ─────────────────────────────
      if (config.mode === 'Manual') {
        runnerState         = 'PausedBeforeStep';
        signal.pauseRequested   = false;
        signal.resumeConfirmed  = false;
        addEvent('PausedBeforeStep', `Waiting for confirmation before step ${step.stepNumber}`,
          step.stepId, step.stepNumber);

        // Spin-wait for resume signal or cancel (100ms poll)
        while (!signal.resumeConfirmed && !cts.token.isCancelled) {
          await this._delay(100);
        }

        if (cts.token.isCancelled) {
          runnerState  = 'Cancelled';
          cancelReason = 'Cancelled at pause';
          prog.status  = 'skipped';
          addEvent('Cancelled', 'Run cancelled during pause');
          break;
        }

        signal.resumeConfirmed = false;
        runnerState = 'Running';
        addEvent('Resumed', `Resumed at step ${step.stepNumber}`, step.stepId, step.stepNumber);
      }

      // ── User-triggered pause (SemiAuto / FullyAuto) ───────────────────────
      if (signal.pauseRequested && config.mode !== 'Manual') {
        runnerState         = 'PausedBeforeStep';
        signal.pauseRequested   = false;
        signal.resumeConfirmed  = false;
        addEvent('PausedBeforeStep', `Paused before step ${step.stepNumber}`,
          step.stepId, step.stepNumber);

        while (!signal.resumeConfirmed && !cts.token.isCancelled) {
          await this._delay(100);
        }

        if (cts.token.isCancelled) {
          runnerState  = 'Cancelled';
          cancelReason = 'Cancelled during pause';
          prog.status  = 'skipped';
          addEvent('Cancelled', 'Run cancelled during pause');
          break;
        }

        signal.resumeConfirmed = false;
        runnerState = 'Running';
        addEvent('Resumed', `Resumed at step ${step.stepNumber}`, step.stepId, step.stepNumber);
      }

      // ── Execute with retry ────────────────────────────────────────────────
      prog.status    = 'running';
      prog.startedAt = new Date().toISOString();
      addEvent('StepStarted', `Step ${step.stepNumber}: ${step.action.action}`,
        step.stepId, step.stepNumber, { driver_id: step.action.driver_id });

      // Note: emitStepIntended is called inside StepExecutor.execute() as the WAL.
      // We do NOT emit it here to avoid a double-write.

      let lastError  = '';
      let stepPassed = false;

      for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        if (attempt > 0) {
          prog.status     = 'retrying';
          prog.retryCount = attempt;
          addEvent('StepRetrying',
            `Retrying step ${step.stepNumber} (attempt ${attempt + 1})`,
            step.stepId, step.stepNumber);
          await this._delay(config.retryDelayMs);
        }

        // Assertion steps bypass StepExecutor and go through AssertionEngine.
        // All other steps use StepExecutor (WAL + driver + event emit).
        const stepResult = step.action.action === 'assertion'
          ? AssertionEngine.toStepResult(
              step.stepId, step.stepNumber, step.action.action,
              await this.assertionEngine.evaluate(
                step.action.params as unknown as AssertionParams,
                driver,
                step.stepId,
                step.timeout_ms,
              ),
            )
          : await this.stepExecutor.execute(driver, step, ctx);
        prog.duration_ms = stepResult.duration_ms;

        if (stepResult.success) {
          stepPassed           = true;
          prog.status          = 'passed';
          prog.completedAt     = new Date().toISOString();
          addEvent('StepPassed',
            `Step ${step.stepNumber} passed (${stepResult.duration_ms}ms)`,
            step.stepId, step.stepNumber, { duration_ms: stepResult.duration_ms });

          await this.emitter.emitStepCompleted(
            { session_id: sessionId, step_id: step.stepId, step_number: step.stepNumber,
              duration_ms: stepResult.duration_ms, assertion_passed: stepResult.success },
            ctx,
          );
          break;
        } else {
          lastError = stepResult.error ?? 'Unknown failure';
          if (attempt === config.maxRetries) {
            // ── Self-healing hook (M7) ────────────────────────────────────────
            // Try healing before marking the step as permanently failed.
            // healing.tryHeal() never modifies the stored automation_config.
            if (this.healingPlugin) {
              const healResult = await this.healingPlugin.tryHeal(
                step, driver, lastError, runId, sessionId,
              );
              if (healResult.outcome === 'healed') {
                stepPassed       = true;
                prog.status      = 'passed';
                prog.completedAt = new Date().toISOString();
                addEvent('StepPassed',
                  `Step ${step.stepNumber} healed and passed (strategy: ${healResult.strategyUsed})`,
                  step.stepId, step.stepNumber,
                  { healed: true, strategy: healResult.strategyUsed,
                    confidence: healResult.confidence });
                await this.emitter.emitStepCompleted(
                  { session_id: sessionId, step_id: step.stepId,
                    step_number: step.stepNumber, duration_ms: stepResult.duration_ms,
                    assertion_passed: true },
                  ctx,
                );
                break;
              }
            }
            // ── End healing hook ──────────────────────────────────────────────

            prog.status      = 'failed';
            prog.error       = lastError;
            prog.completedAt = new Date().toISOString();

            addEvent('StepFailed',
              `Step ${step.stepNumber} failed: ${lastError}`,
              step.stepId, step.stepNumber, { error: lastError, attempts: attempt + 1 });

            await this.emitter.emitStepFailed(
              { session_id: sessionId, step_id: step.stepId, step_number: step.stepNumber,
                duration_ms: stepResult.duration_ms, failure_reason: lastError },
              ctx,
            );
          }
        }
      }

      if (!stepPassed) {
        // ── SemiAuto: pause on failure for user decision ─────────────────────
        if (config.mode === 'SemiAuto') {
          runnerState         = 'PausedOnFailure';
          signal.failureDecision  = undefined;
          signal.resumeConfirmed  = false;
          addEvent('PausedOnFailure',
            `Paused after step ${step.stepNumber} failure — awaiting user decision`,
            step.stepId, step.stepNumber);

          while (signal.failureDecision === undefined && !cts.token.isCancelled) {
            await this._delay(100);
          }

          if (cts.token.isCancelled || signal.failureDecision === 'abort') {
            runnerState  = 'Cancelled';
            cancelReason = 'Aborted on failure';
            addEvent('Cancelled', 'Run aborted after step failure');
            break;
          }

          if (signal.failureDecision === 'skip') {
            prog.status = 'skipped';
            addEvent('StepSkipped', `Step ${step.stepNumber} skipped by user`,
              step.stepId, step.stepNumber);
            runnerState = 'Running';
            continue;
          }

          if (signal.failureDecision === 'retry') {
            // Put step back on the queue by decrementing i
            signal.failureDecision = undefined;
            runnerState            = 'Running';
            i--;
            continue;
          }
        }

        // FullyAuto / Manual: check stopOnFailure
        if (config.stopOnFailure) {
          runnerState = 'Failed';
          runError    = lastError;
          addEvent('RunFailed', `Run stopped on step ${step.stepNumber} failure`);

          await this.emitter.emitExecutionFailed(
            { session_id: sessionId, failed_step_id: step.stepId,
              failed_step_number: step.stepNumber, failure_reason: lastError,
              total_steps: steps.length,
              passed: stepProgress.filter(p => p.status === 'passed').length,
              failed: stepProgress.filter(p => p.status === 'failed').length,
              duration_ms: Date.now() - t0 },
            ctx,
          );
          break;
        }
        // stopOnFailure=false: log and continue
      }

      if ((runnerState as string) === 'Failed' || (runnerState as string) === 'Cancelled') break;
    }

    // ── Disconnect ───────────────────────────────────────────────────────────
    try {
      await driver.disconnect();
      if (driver.dispose) await driver.dispose();
    } catch (err) {
      this.logger.warn('driver_disconnect_error',
        { run_id: runId, error: err instanceof Error ? err.message : String(err) });
    }

    // ── Terminal state ────────────────────────────────────────────────────────
    const duration_ms  = Date.now() - t0;
    const passedSteps  = stepProgress.filter(p => p.status === 'passed').length;
    const failedSteps  = stepProgress.filter(p => p.status === 'failed').length;
    const skippedSteps = stepProgress.filter(p => p.status === 'skipped').length;
    const evidenceCount = stepProgress.reduce((n, p) => n + p.evidenceIds.length, 0);

    if (runnerState === 'Running') {
      runnerState = 'Completed';
      addEvent('RunCompleted',
        `Run completed — ${passedSteps}/${steps.length} passed in ${duration_ms}ms`);
      await this.emitter.emitExecutionCompleted(
        { session_id: sessionId, total_steps: steps.length,
          passed: passedSteps, failed: failedSteps, skipped: skippedSteps, duration_ms },
        ctx,
      );
    } else if (runnerState === 'Cancelled') {
      await this.emitter.emitExecutionCancelled(
        { session_id: sessionId, cancelled_by: 'user', reason: cancelReason },
        ctx,
      );
    }

    return this._makeReport(
      runId, sessionId, testCaseId, runnerState, config.mode,
      steps.length, passedSteps, failedSteps, skippedSteps,
      duration_ms, stepProgress, startedAt,
      runError, cancelReason, evidenceCount, timelineEvents,
    );
  }

  // ── Cancel helper ──────────────────────────────────────────────────────────

  /** Cancel a running session by id (if the signal object is shared). */
  static requestCancel(signal: PauseResumeSignal): void {
    signal.pauseRequested = false;
    signal.resumeConfirmed = false;
    signal.failureDecision = 'abort';
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  private _makeReport(
    runId: string, sessionId: string, testCaseId: string,
    state: RunnerState, mode: import('./AutonomousRunnerTypes.js').ExecutionMode,
    totalSteps: number, passedSteps: number, failedSteps: number, skippedSteps: number,
    duration_ms: number, stepProgress: StepProgress[],
    startedAt: string, error: string, cancelReason: string,
    evidenceCount: number, timelineEvents: RunnerTimelineEvent[],
  ): RunnerReport {
    return {
      runId, sessionId, testCaseId, state, mode,
      totalSteps, passedSteps, failedSteps, skippedSteps,
      duration_ms, stepProgress, startedAt,
      completedAt: new Date().toISOString(),
      error:        error        || undefined,
      cancelReason: cancelReason || undefined,
      evidenceCount, timelineEvents,
    };
  }
}
