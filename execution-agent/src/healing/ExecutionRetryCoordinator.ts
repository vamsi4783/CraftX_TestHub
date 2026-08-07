// ─── ExecutionRetryCoordinator (Phase 4 M7) ───────────────────────────────────
// Given a patched ExecutionStep and a live driver, retries the step.
// Owns the retry-timing logic so SelfHealingEngine stays focused on strategy.

import type { IDriver }       from '../drivers/IDriver.js';
import type { ExecutionStep } from '../execution/ExecutionTypes.js';
import type { StepExecutor }  from '../execution/StepExecutor.js';
import type { ExecutionContext } from '../execution/ExecutionContext.js';

export interface RetryOutcome {
  success:    boolean;
  duration_ms: number;
  error?:     string;
  screenshot?: Buffer;
}

export class ExecutionRetryCoordinator {
  constructor(
    private readonly stepExecutor: StepExecutor,
    private readonly delayMs:      number = 500,
  ) {}

  /**
   * Execute the (possibly patched) step once.
   * The step has already had its locator updated by LocatorResolver.buildPatchedStep().
   */
  async execute(
    step:   ExecutionStep,
    driver: IDriver,
    ctx:    ExecutionContext,
  ): Promise<RetryOutcome> {
    await this._wait(this.delayMs);

    try {
      const result = await this.stepExecutor.execute(driver, step, ctx);
      return {
        success:    result.success,
        duration_ms: result.duration_ms,
        error:      result.error,
        screenshot: result.screenshot,
      };
    } catch (err) {
      return {
        success:    false,
        duration_ms: 0,
        error:      err instanceof Error ? err.message : String(err),
      };
    }
  }

  private _wait(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
