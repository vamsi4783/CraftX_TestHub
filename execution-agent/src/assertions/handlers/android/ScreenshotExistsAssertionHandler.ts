// Asserts a screenshot can be captured (evidence availability check).
// Captures a screenshot; PASS if screenshot buffer is non-empty.

import type { IDriver }             from '../../../drivers/IDriver.js';
import type { IAssertionHandler }   from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult, AssertionEvidence } from '../../AssertionTypes.js';
import { makeResult, applyNegate }  from '../_base.js';

export class ScreenshotExistsAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_screenshot_exists' as const;

  async evaluate(params: AssertionParams, driver: IDriver, stepId: string): Promise<AssertionResult> {
    const t0 = Date.now();

    try {
      const result = await driver.execute({ action: 'screenshot' });
      const hasScreenshot = result.success && (
        (result.screenshot && result.screenshot.length > 0) ||
        (result.raw as { size?: number } | undefined)?.size !== undefined
      );

      let evidence: AssertionEvidence | undefined;
      if (result.screenshot && result.screenshot.length > 0) {
        evidence = {
          type:       'screenshot',
          data:       result.screenshot,
          capturedAt: new Date().toISOString(),
          stepId,
        };
      }

      return applyNegate(makeResult(
        this.kind,
        hasScreenshot ? 'PASS' : 'FAIL',
        'screenshot available',
        hasScreenshot ? `screenshot (${result.screenshot?.length ?? 0} bytes)` : '[no screenshot]',
        hasScreenshot ? 'Screenshot captured successfully' : 'Screenshot capture failed or returned empty buffer',
        Date.now() - t0,
        { evidence },
      ), params.negate);
    } catch (err) {
      return makeResult(this.kind, 'ERROR', 'screenshot available', '', err instanceof Error ? err.message : String(err), Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
