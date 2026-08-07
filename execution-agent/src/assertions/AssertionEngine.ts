// ─── AssertionEngine ──────────────────────────────────────────────────────────
// Evaluates an assertion config using the registered AssertionRegistry.
// Integrates with AutonomousRunnerEngine as the assertion execution delegate.
//
// Rules:
// - Never throws — all exceptions become ERROR-status AssertionResults.
// - Captures screenshot evidence automatically on FAIL when driver supports it.
// - Timeout is enforced per-assertion (wraps the handler evaluate() call).
// - Does NOT call StepExecutor or ExecutionEngine; assertion steps bypass them.

import { StructuredLogger }   from '../logging/StructuredLogger.js';
import type { IDriver }       from '../drivers/IDriver.js';
import type { StepResult }    from '../execution/ExecutionTypes.js';
import type {
  AssertionParams,
  AssertionResult,
  AssertionEvidence,
} from './AssertionTypes.js';
import type { AssertionRegistry } from './AssertionRegistry.js';

// ─── Timeout wrapper ─────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Assertion timed out after ${ms}ms (${label})`)),
      ms,
    );
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class AssertionEngine {
  private readonly logger = new StructuredLogger('AssertionEngine');

  constructor(private readonly registry: AssertionRegistry) {}

  /**
   * Evaluate one assertion step.
   *
   * @param params   AssertionParams extracted from AutomationConfig.params.
   * @param driver   Connected IDriver for the current session.
   * @param stepId   Step identifier (for evidence tagging).
   * @param timeout_ms  Per-assertion timeout override. 0 = no timeout.
   */
  async evaluate(
    params:     AssertionParams,
    driver:     IDriver,
    stepId:     string,
    timeout_ms = 0,
  ): Promise<AssertionResult> {
    const kind = params.assertion_kind;

    if (!this.registry.has(kind)) {
      return {
        assertionKind: kind,
        status:        'ERROR',
        expected:      params.expected ?? '',
        actual:        '',
        message:       `Unknown assertion kind: "${kind}"`,
        duration_ms:   0,
        error:         `No handler registered for "${kind}"`,
      };
    }

    const handler = this.registry.resolve(kind);
    const t0 = Date.now();

    try {
      const effective_timeout = params.timeout_ms ?? timeout_ms;
      const resultPromise     = handler.evaluate(params, driver, stepId);
      const result = await withTimeout(resultPromise, effective_timeout, kind);

      // On FAIL: attempt to capture screenshot evidence (best-effort)
      if (result.status === 'FAIL' && !result.evidence && driver.manifest.capabilities.has('screenshot')) {
        try {
          const shot = await driver.execute({ action: 'screenshot' });
          if (shot.screenshot && shot.screenshot.length > 0) {
            const evidence: AssertionEvidence = {
              type:       'screenshot',
              data:       shot.screenshot,
              capturedAt: new Date().toISOString(),
              stepId,
              metadata:   { assertion_kind: kind, expected: params.expected },
            };
            return { ...result, evidence };
          }
        } catch (evidenceErr) {
          this.logger.warn('assertion_evidence_capture_failed', {
            step_id: stepId,
            kind,
            error: evidenceErr instanceof Error ? evidenceErr.message : String(evidenceErr),
          });
        }
      }

      this.logger.info('assertion_evaluated', {
        step_id: stepId, kind, status: result.status, duration_ms: Date.now() - t0,
      });

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('assertion_error', { step_id: stepId, kind, error: msg });
      return {
        assertionKind: kind,
        status:        'ERROR',
        expected:      params.expected ?? '',
        actual:        '',
        message:       msg,
        duration_ms:   Date.now() - t0,
        error:         msg,
      };
    }
  }

  /**
   * Convert an AssertionResult to a StepResult for use in AutonomousRunnerEngine.
   * PASS → success = true. FAIL / ERROR / SKIPPED → success = false.
   */
  static toStepResult(
    stepId:     string,
    stepNumber: number,
    action:     string,
    result:     AssertionResult,
  ): StepResult {
    return {
      stepId,
      stepNumber,
      action,
      success:     result.status === 'PASS',
      duration_ms: result.duration_ms,
      screenshot:  result.evidence?.type === 'screenshot'
        ? (result.evidence.data instanceof Buffer ? result.evidence.data : undefined)
        : undefined,
      error: result.status !== 'PASS' ? result.message : undefined,
    };
  }
}
