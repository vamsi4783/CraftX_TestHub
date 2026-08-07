// ─── StepExecutor ─────────────────────────────────────────────────────────────
// Executes one step through the Write-Ahead → Driver → Event sequence.
//
// Strict ordering:
//   1. emitStepIntended  (WAL — MUST resolve before driver call)
//   2. metrics.step_started
//   3. DriverHost.execute()
//   4. emitStepCompleted OR emitStepFailed
//   5. metrics.step_finished
//
// All driver exceptions (timeout, cancellation, execution error) are caught here
// and converted to a failed StepResult so ExecutionEngine can decide the
// overall execution outcome.

import type { IDriver }                   from '../drivers/IDriver.js';
import type { DriverHost }                from '../drivers/DriverHost.js';
import type { DriverExecutionContext }    from '../drivers/DriverExecutionContext.js';
import type { ExecutionStep, StepResult } from './ExecutionTypes.js';
import type { ExecutionContext }          from './ExecutionContext.js';
import type { IExecutionEventEmitter }   from './events/IExecutionEventEmitter.js';
import { StructuredLogger }              from '../logging/StructuredLogger.js';

export class StepExecutor {
  private readonly logger = new StructuredLogger('StepExecutor');

  constructor(
    private readonly host:    DriverHost,
    private readonly emitter: IExecutionEventEmitter,
  ) {}

  /**
   * Execute a single step.
   * Always resolves — exceptions are captured into StepResult.success = false.
   */
  async execute(
    driver: IDriver,
    step:   ExecutionStep,
    ctx:    ExecutionContext,
  ): Promise<StepResult> {
    const t0 = Date.now();

    // ── 1. WAL: persist intent BEFORE touching the driver ──────────────────
    await this.emitter.emitStepIntended(
      {
        session_id:  ctx.sessionId,
        step_id:     step.stepId,
        step_number: step.stepNumber,
        action:      step.action,
      },
      ctx,
    );

    // ── 2. Metrics ──────────────────────────────────────────────────────────
    ctx.metrics.step_started(ctx.executionId, step.stepId, step.stepNumber);

    this.logger.info('step_execute_start', {
      execution_id: ctx.executionId,
      session_id:   ctx.sessionId,
      step_id:      step.stepId,
      step_number:  step.stepNumber,
      action:       step.action.action,
    });

    // ── 3. Build DriverExecutionContext ─────────────────────────────────────
    const driverCtx: DriverExecutionContext = {
      executionId:       ctx.executionId,
      sessionId:         ctx.sessionId,
      projectId:         ctx.projectId,
      organizationId:    ctx.organizationId,
      correlationId:     ctx.correlationId,
      cancellationToken: ctx.cancellationToken,
      logger:            ctx.logger,
      timestamp:         new Date().toISOString(),
    };

    // ── 4. Execute ──────────────────────────────────────────────────────────
    try {
      const result = await this.host.execute(
        driver,
        {
          action:   step.action.action,
          selector: step.action.selector,
          value:    step.action.value,
          params:   step.action.params,
        },
        driverCtx,
        step.timeout_ms !== undefined ? { timeout_ms: step.timeout_ms } : undefined,
      );

      const duration_ms = Date.now() - t0;

      await this.emitter.emitStepCompleted(
        {
          session_id:       ctx.sessionId,
          step_id:          step.stepId,
          step_number:      step.stepNumber,
          duration_ms,
          assertion_passed: result.success,
        },
        ctx,
      );

      ctx.metrics.step_finished(ctx.executionId, step.stepId, result.success, duration_ms);

      this.logger.info('step_execute_done', {
        execution_id: ctx.executionId,
        step_id:      step.stepId,
        success:      result.success,
        duration_ms,
      });

      return {
        stepId:     step.stepId,
        stepNumber: step.stepNumber,
        action:     step.action.action,
        success:    result.success,
        duration_ms,
        screenshot: result.screenshot,
        error:      result.error,
      };

    } catch (err: unknown) {
      const duration_ms   = Date.now() - t0;
      const failure_reason = err instanceof Error ? err.message : String(err);

      await this.emitter.emitStepFailed(
        {
          session_id:     ctx.sessionId,
          step_id:        step.stepId,
          step_number:    step.stepNumber,
          duration_ms,
          failure_reason,
        },
        ctx,
      );

      ctx.metrics.step_finished(ctx.executionId, step.stepId, false, duration_ms);

      this.logger.error('step_execute_failed', {
        execution_id:   ctx.executionId,
        step_id:        step.stepId,
        failure_reason,
        duration_ms,
      });

      return {
        stepId:     step.stepId,
        stepNumber: step.stepNumber,
        action:     step.action.action,
        success:    false,
        duration_ms,
        error:      failure_reason,
      };
    }
  }
}
