// ─── Driver Host / Sandbox ────────────────────────────────────────────────────
// Owns ALL cross-cutting concerns for driver execution:
//   • capability validation      — checked before execute()
//   • connected check            — checked before execute()
//   • timeout                    — Promise.race vs a timer
//   • cancellation               — Promise.race vs CancellationToken
//   • structured execution log   — start / success / failure / timeout / cancel
//   • OTel span                  — no-op Phase 3, activated Phase 6
//   • middleware hooks           — before / after / onError
//
// IDriver implementations must NOT implement any of these concerns themselves.
// Phase 5: swap to Worker Thread inside this class without touching callers.

import type { IDriver, ActionRequest, ActionResult } from './IDriver.js';
import type { DriverExecutionContext }               from './DriverExecutionContext.js';
import type { DriverResult }                         from './DriverResult.js';
import type { IDriverMiddleware }                    from './middleware/IDriverMiddleware.js';
import type { Capability }                           from './CapabilityManifest.js';
import {
  DriverTimeoutException,
  DriverCancelledException,
  DriverCapabilityException,
  DriverExecutionException,
  DriverNotConnectedException,
} from './DriverExceptions.js';
import { StructuredLogger } from '../logging/StructuredLogger.js';
import { startSpan, SPANS } from '../otel/stubs.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export const DEFAULT_TIMEOUT_MS = 30_000;

export interface DriverHostOptions {
  /** Default timeout applied when options.timeout_ms is not supplied. Default: 30 000 ms. */
  defaultTimeout_ms?: number;
}

export interface ExecuteOptions {
  /** Per-call timeout override. Falls back to DriverHostOptions.defaultTimeout_ms. */
  timeout_ms?: number;
}

// Race outcome — all branches RESOLVE so no unhandled-rejection warnings arise.
type RaceOutcome =
  | { kind: 'result';    value: ActionResult }
  | { kind: 'error';     error: unknown       }
  | { kind: 'timeout'                         }
  | { kind: 'cancelled'                       };

// ─── DriverHost ──────────────────────────────────────────────────────────────

export class DriverHost {
  private readonly logger      = new StructuredLogger('DriverHost');
  private readonly middlewares: IDriverMiddleware[] = [];
  private readonly defaultTimeout_ms: number;

  constructor(options: DriverHostOptions = {}) {
    this.defaultTimeout_ms = options.defaultTimeout_ms ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Register middleware for metrics / tracing hooks.
   * Middleware is called in registration order.
   * Phase 3: no built-in implementations.
   */
  use(middleware: IDriverMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Execute a driver action through the host sandbox.
   *
   * Lifecycle (in order):
   *   1. Connected check         → DriverNotConnectedException
   *   2. Capability check        → DriverCapabilityException
   *   3. middleware.beforeExecute
   *   4. Promise.race:
   *        driver.execute()      → wraps errors as DriverExecutionException
   *        timeout promise       → DriverTimeoutException
   *        cancellation promise  → DriverCancelledException
   *   5. middleware.afterExecute (on success) | middleware.onError (on failure)
   *   6. Return DriverResult | throw DriverException
   */
  async execute(
    driver:  IDriver,
    request: ActionRequest,
    ctx:     DriverExecutionContext,
    options?: ExecuteOptions,
  ): Promise<DriverResult> {
    const timeout_ms = options?.timeout_ms ?? this.defaultTimeout_ms;
    const span = startSpan(SPANS.DRIVER_EXECUTE, { driver_id: driver.id, action: request.action });
    const t0   = Date.now();

    this.logger.info('driver_execute_start', {
      correlation_id: ctx.correlationId,
      execution_id:   ctx.executionId,
      driver_id:      driver.id,
      action:         request.action,
      timeout_ms,
    });

    // ── 1. Connected check ──────────────────────────────────────────────────
    if (!driver.isConnected()) {
      const err = new DriverNotConnectedException(driver.id);
      this.logger.error('driver_not_connected', {
        correlation_id: ctx.correlationId,
        driver_id:      driver.id,
        result:         'failure',
        error:          err.message,
      });
      span.recordException(err);
      span.end();
      throw err;
    }

    // ── 2. Capability check ─────────────────────────────────────────────────
    if (!driver.manifest.capabilities.has(request.action as Capability)) {
      const err = new DriverCapabilityException(
        driver.id,
        request.action,
        driver.manifest.capabilities,
      );
      this.logger.warn('driver_capability_mismatch', {
        correlation_id: ctx.correlationId,
        driver_id:      driver.id,
        action:         request.action,
        result:         'rejected',
        error:          err.message,
      });
      span.recordException(err);
      span.end();
      throw err;
    }

    // ── 3. Middleware before ────────────────────────────────────────────────
    await this._runBefore(driver, request, ctx);

    // ── 4. Race ─────────────────────────────────────────────────────────────
    // Each participant resolves (never rejects) to prevent unhandled-rejection warnings
    // from the two losers in the race.
    let clearTimer: () => void = () => {};

    const driverP: Promise<RaceOutcome> = driver.execute(request).then(
      value => ({ kind: 'result'  as const, value }),
      error => ({ kind: 'error'   as const, error }),
    );

    const timeoutP: Promise<RaceOutcome> = new Promise(resolve => {
      const tid = setTimeout(() => resolve({ kind: 'timeout' }), timeout_ms);
      clearTimer = () => clearTimeout(tid);
      // Allow process to exit in test environments even when this timer is pending
      tid.unref();
    });

    const cancelP: Promise<RaceOutcome> = new Promise(resolve => {
      if (ctx.cancellationToken.isCancelled) {
        resolve({ kind: 'cancelled' });
      } else {
        ctx.cancellationToken.onCancelled(() => resolve({ kind: 'cancelled' }));
      }
    });

    const outcome = await Promise.race([driverP, timeoutP, cancelP]);
    clearTimer();  // If driver or cancellation won, stop the pending timeout timer

    const duration_ms = Date.now() - t0;

    // ── 5. Resolve outcome ──────────────────────────────────────────────────

    if (outcome.kind === 'timeout') {
      const err = new DriverTimeoutException(driver.id, timeout_ms, request.action);
      this.logger.error('driver_execute_timeout', {
        correlation_id: ctx.correlationId,
        driver_id:      driver.id,
        action:         request.action,
        timeout_ms,
        duration_ms,
        result:         'failure',
        error:          err.message,
      });
      await this._runError(driver, request, ctx, err);
      span.recordException(err);
      span.end();
      throw err;
    }

    if (outcome.kind === 'cancelled') {
      const err = new DriverCancelledException(driver.id, request.action);
      this.logger.warn('driver_execute_cancelled', {
        correlation_id: ctx.correlationId,
        driver_id:      driver.id,
        action:         request.action,
        duration_ms,
        result:         'failure',
        error:          err.message,
      });
      await this._runError(driver, request, ctx, err);
      span.recordException(err);
      span.end();
      throw err;
    }

    if (outcome.kind === 'error') {
      const err = new DriverExecutionException(driver.id, request.action, outcome.error);
      this.logger.error('driver_execute_failed', {
        correlation_id: ctx.correlationId,
        driver_id:      driver.id,
        action:         request.action,
        duration_ms,
        result:         'failure',
        error:          err.message,
      });
      await this._runError(driver, request, ctx, err);
      span.recordException(err);
      span.end();
      throw err;
    }

    // outcome.kind === 'result'
    const result: DriverResult = {
      success:      outcome.value.success,
      duration_ms,
      screenshot:   outcome.value.screenshot,
      error:        outcome.value.error,
      raw:          outcome.value.raw,
      driver_id:    driver.id,
      action:       request.action,
      execution_id: ctx.executionId,
      session_id:   ctx.sessionId,
    };

    this.logger.info('driver_execute_success', {
      correlation_id: ctx.correlationId,
      driver_id:      driver.id,
      action:         request.action,
      duration_ms,
      result:         'success',
    });

    await this._runAfter(driver, request, ctx, result);
    span.end();
    return result;
  }

  // ─── Middleware runners ───────────────────────────────────────────────────

  private async _runBefore(
    driver: IDriver, request: ActionRequest, ctx: DriverExecutionContext,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.beforeExecute) await mw.beforeExecute(driver, request, ctx);
    }
  }

  private async _runAfter(
    driver: IDriver, request: ActionRequest, ctx: DriverExecutionContext, result: DriverResult,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.afterExecute) await mw.afterExecute(driver, request, ctx, result);
    }
  }

  private async _runError(
    driver: IDriver, request: ActionRequest, ctx: DriverExecutionContext, error: Error,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onError) await mw.onError(driver, request, ctx, error);
    }
  }
}
