// ─── ExecutionEngine ──────────────────────────────────────────────────────────
// Orchestrates the full execution lifecycle:
//
//   ExecutionRequested (input)
//   → ExecutionStarted (event)
//   → per-step: [RulePack check] → StepIntended (WAL) → DriverHost → StepCompleted/Failed
//   → ExecutionCompleted | ExecutionFailed | ExecutionCancelled (event)
//
// The engine is stateless between calls — each execute() call is independent.
// State is carried by ExecutionStateMachine (local to the call).

import { uuidv7 }                          from 'uuidv7';
import type { DriverRegistry }             from '../drivers/DriverRegistry.js';
import { NON_CANCELLABLE }                 from '../drivers/DriverCancellation.js';
import { StructuredLogger }                from '../logging/StructuredLogger.js';
import { NOOP_METRICS }                    from './ExecutionMetrics.js';
import { ExecutionStateMachine }           from './ExecutionStateMachine.js';
import type { StepExecutor }              from './StepExecutor.js';
import type { IExecutionEventEmitter }    from './events/IExecutionEventEmitter.js';
import type { ExecutionRequest,
              ExecutionResult,
              ExecutionState,
              StepResult }                from './ExecutionTypes.js';
import type { ExecutionContext }          from './ExecutionContext.js';
import type { RuleViolation }            from './rules/IRulePack.js';

// ─── ExecutionEngine ──────────────────────────────────────────────────────────

export class ExecutionEngine {
  private readonly logger = new StructuredLogger('ExecutionEngine');

  constructor(
    private readonly driverRegistry: DriverRegistry,
    private readonly emitter:        IExecutionEventEmitter,
    private readonly stepExecutor:   StepExecutor,
  ) {}

  /**
   * Run a full execution plan.
   * Always resolves — catastrophic startup errors are captured in the result.
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const executionId      = uuidv7();
    const cancellationToken = request.cancellationToken ?? NON_CANCELLABLE;
    const metrics           = NOOP_METRICS;
    const logger            = new StructuredLogger(`ExecutionEngine:${executionId.slice(0, 8)}`);

    const ctx: ExecutionContext = {
      executionId,
      sessionId:       request.sessionId,
      projectId:       request.projectId,
      organizationId:  request.organizationId,
      agentId:         request.agentId,
      correlationId:   request.sessionId,
      currentStep:     0,
      totalSteps:      request.steps.length,
      cancellationToken,
      logger,
      metrics,
    };

    const machine = new ExecutionStateMachine();
    const t0      = Date.now();

    metrics.execution_started(executionId, request.sessionId);
    this.logger.info('execution_start', {
      execution_id: executionId,
      session_id:   request.sessionId,
      driver_id:    request.driverId,
      total_steps:  request.steps.length,
    });

    // ── Starting ────────────────────────────────────────────────────────────
    machine.transition('Starting');

    // Resolve and connect driver
    let driver;
    try {
      driver = this.driverRegistry.resolve(request.driverId);
      if (driver.initialize) await driver.initialize();
      await driver.connect(request.driverConfig ?? {});
    } catch (err) {
      machine.transition('Failed');
      const duration_ms = Date.now() - t0;
      const error       = err instanceof Error ? err.message : String(err);
      metrics.execution_finished(executionId, 'Failed', duration_ms);
      metrics.execution_duration(executionId, duration_ms);
      return {
        executionId, sessionId: request.sessionId,
        state: 'Failed', totalSteps: request.steps.length,
        passedSteps: 0, failedSteps: 0, skippedSteps: 0,
        duration_ms, stepResults: [], error,
      };
    }

    // Emit ExecutionStarted
    await this.emitter.emitExecutionStarted(
      {
        session_id:  request.sessionId,
        test_case_id: request.testCaseId,
        driver_id:   request.driverId,
        total_steps: request.steps.length,
      },
      ctx,
    );

    // ── Running ─────────────────────────────────────────────────────────────
    machine.transition('Running');

    const stepResults: StepResult[]  = [];
    let   finalState: ExecutionState = 'Running';
    let   cancelReason               = '';
    let   failedStep: StepResult | null = null;

    for (const step of request.steps) {
      ctx.currentStep = step.stepNumber;

      // ── Pre-step cancellation check ──────────────────────────────────────
      if (cancellationToken.isCancelled) {
        machine.transition('Cancelling');
        machine.transition('Cancelled');
        finalState   = 'Cancelled';
        cancelReason = 'Cancellation requested before step';
        break;
      }

      // ── RulePack evaluation ──────────────────────────────────────────────
      const rulePacks      = request.rulePacks ?? [];
      let   ruleViolation: RuleViolation | null = null;

      for (const pack of rulePacks) {
        const violation = await pack.evaluate(step, ctx);
        if (violation) { ruleViolation = violation; break; }
      }

      if (ruleViolation?.is_fatal) {
        // Fatal rule violation — block the step without calling the driver
        const ruleResult: StepResult = {
          stepId:       step.stepId,
          stepNumber:   step.stepNumber,
          action:       step.action.action,
          success:      false,
          duration_ms:  0,
          error:        ruleViolation.description,
          skippedByRule: true,
          ruleViolation,
        };
        stepResults.push(ruleResult);

        await this.emitter.emitStepFailed(
          {
            session_id:     request.sessionId,
            step_id:        step.stepId,
            step_number:    step.stepNumber,
            duration_ms:    0,
            failure_reason: ruleViolation.description,
            rule_pack_id:   ruleViolation.rule_pack_id,
          },
          ctx,
        );

        machine.transition('Failed');
        finalState  = 'Failed';
        failedStep  = ruleResult;
        break;
      }

      // Non-fatal rule violation: log and continue
      if (ruleViolation) {
        logger.warn('rule_violation_non_fatal', {
          execution_id: executionId,
          step_id:      step.stepId,
          rule_id:      ruleViolation.rule_id,
          description:  ruleViolation.description,
        });
      }

      // ── Step execution ───────────────────────────────────────────────────
      const stepResult = await this.stepExecutor.execute(driver, step, ctx);
      stepResults.push(stepResult);

      if (!stepResult.success) {
        // Check if cancellation caused the failure
        if (cancellationToken.isCancelled) {
          machine.transition('Cancelling');
          machine.transition('Cancelled');
          finalState   = 'Cancelled';
          cancelReason = 'Cancellation during step execution';
        } else {
          machine.transition('Failed');
          finalState = 'Failed';
          failedStep = stepResult;
        }
        break;
      }
    }

    // ── Terminal state ───────────────────────────────────────────────────────
    if (finalState === 'Running') {
      machine.transition('Completed');
      finalState = 'Completed';
    }

    // Disconnect driver
    try {
      await driver.disconnect();
      if (driver.dispose) await driver.dispose();
    } catch (err) {
      logger.warn('driver_disconnect_error', {
        execution_id: executionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const duration_ms   = Date.now() - t0;
    const passedSteps   = stepResults.filter(r => r.success).length;
    const failedSteps   = stepResults.filter(r => !r.success && !r.skippedByRule).length;
    const skippedSteps  = stepResults.filter(r => r.skippedByRule === true).length;

    // ── Emit terminal event ──────────────────────────────────────────────────
    if (finalState === 'Completed') {
      await this.emitter.emitExecutionCompleted(
        {
          session_id:  request.sessionId,
          total_steps: request.steps.length,
          passed:      passedSteps,
          failed:      failedSteps,
          skipped:     skippedSteps,
          duration_ms,
        },
        ctx,
      );
    } else if (finalState === 'Failed' && failedStep) {
      await this.emitter.emitExecutionFailed(
        {
          session_id:          request.sessionId,
          failed_step_id:      failedStep.stepId,
          failed_step_number:  failedStep.stepNumber,
          failure_reason:      failedStep.error ?? 'Unknown failure',
          total_steps:         request.steps.length,
          passed:              passedSteps,
          failed:              failedSteps,
          duration_ms,
        },
        ctx,
      );
    } else if (finalState === 'Cancelled') {
      await this.emitter.emitExecutionCancelled(
        {
          session_id:   request.sessionId,
          cancelled_by: request.agentId,
          reason:       cancelReason,
        },
        ctx,
      );
    }

    metrics.execution_finished(executionId, finalState, duration_ms);
    metrics.execution_duration(executionId, duration_ms);

    this.logger.info('execution_done', {
      execution_id: executionId,
      state:        finalState,
      duration_ms,
      passed_steps: passedSteps,
      failed_steps: failedSteps,
    });

    return {
      executionId,
      sessionId:   request.sessionId,
      state:       finalState,
      totalSteps:  request.steps.length,
      passedSteps,
      failedSteps,
      skippedSteps,
      duration_ms,
      stepResults,
      cancelReason: finalState === 'Cancelled' ? cancelReason : undefined,
      error:        failedStep?.error,
    };
  }
}
