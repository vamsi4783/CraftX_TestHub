// ─── Driver Middleware Interface ──────────────────────────────────────────────
// Extension point for metrics, tracing, and custom hooks around driver execution.
// Register middleware with DriverHost.use() — they are called in registration order.
//
// Phase 3: interface defined, no implementations.
// Phase 4: OTel span middleware added.
// Phase 6: Metrics middleware activated.

import type { IDriver } from '../IDriver.js';
import type { ActionRequest } from '../IDriver.js';
import type { DriverExecutionContext } from '../DriverExecutionContext.js';
import type { DriverResult } from '../DriverResult.js';

export interface IDriverMiddleware {
  /**
   * Called by DriverHost immediately BEFORE driver.execute().
   * Called after capability validation and connected check.
   * Throwing aborts the execution — the driver is never called.
   */
  beforeExecute?(
    driver:  IDriver,
    request: ActionRequest,
    ctx:     DriverExecutionContext,
  ): Promise<void> | void;

  /**
   * Called by DriverHost immediately AFTER a SUCCESSFUL driver.execute().
   * Throwing propagates to the DriverHost caller.
   */
  afterExecute?(
    driver:  IDriver,
    request: ActionRequest,
    ctx:     DriverExecutionContext,
    result:  DriverResult,
  ): Promise<void> | void;

  /**
   * Called by DriverHost when execute() results in any DriverException
   * (timeout, cancellation, capability mismatch, execution error).
   * Throwing replaces the original error with the middleware error.
   */
  onError?(
    driver:  IDriver,
    request: ActionRequest,
    ctx:     DriverExecutionContext,
    error:   Error,
  ): Promise<void> | void;
}
