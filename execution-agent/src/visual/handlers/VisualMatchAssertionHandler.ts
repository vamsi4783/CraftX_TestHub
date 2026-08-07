// ─── VisualMatchAssertionHandler (Phase 4 M5) ─────────────────────────────────
// IAssertionHandler adapter — bridges AssertionEngine → VisualComparisonEngine.
// Registered in AssertionRegistry alongside M4 handlers.

import { StructuredLogger }        from '../../logging/StructuredLogger.js';
import type { IAssertionHandler }  from '../../assertions/handlers/IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../assertions/AssertionTypes.js';
import type { IDriver }            from '../../drivers/IDriver.js';
import { VisualComparisonEngine }  from '../VisualComparisonEngine.js';
import type { IBaselineStore }     from '../BaselineStore.js';
import type { VisualAssertionParams } from '../VisualTypes.js';

export class VisualMatchAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_visual_match' as const;

  private readonly logger  = new StructuredLogger('VisualMatchHandler');
  private readonly engine:  VisualComparisonEngine;

  constructor(store: IBaselineStore) {
    this.engine = new VisualComparisonEngine(store);
  }

  async evaluate(
    params:  AssertionParams,
    driver:  IDriver,
    stepId:  string,
  ): Promise<AssertionResult> {
    const t0 = Date.now();

    // ── Capture current screenshot via driver ─────────────────────────────────
    let screenshotBuf: Buffer | undefined;
    try {
      const res = await driver.execute({ action: 'screenshot' });
      screenshotBuf = res.screenshot instanceof Buffer
        ? res.screenshot
        : res.raw?.screenshot instanceof Buffer
          ? res.raw.screenshot
          : undefined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('screenshot_capture_failed', { step_id: stepId, error: msg });
    }

    if (!screenshotBuf || screenshotBuf.byteLength === 0) {
      return {
        assertionKind: 'assert_visual_match',
        status:        'ERROR',
        expected:      'screenshot',
        actual:        'empty or missing',
        message:       'Driver did not return a valid screenshot buffer.',
        duration_ms:   Date.now() - t0,
        error:         'Screenshot capture failed or returned empty buffer.',
      };
    }

    const vParams   = params as VisualAssertionParams;
    const startedAt = new Date().toISOString();

    return this.engine.evaluate(screenshotBuf, vParams, stepId, startedAt);
  }
}
