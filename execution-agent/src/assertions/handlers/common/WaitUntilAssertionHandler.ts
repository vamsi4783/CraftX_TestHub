// Polls another assertion handler until it passes or times out.
// Uses assert_text_exists or assert_element_exists internally as the sub-check.
// params.expected holds the text / selector to wait for.
// params.timeout_ms: default 5 000. params.poll_interval_ms: default 500.

import type { IDriver }           from '../../../drivers/IDriver.js';
import type { IAssertionHandler } from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../AssertionTypes.js';
import { makeResult, applyNegate, expected } from '../_base.js';

export class WaitUntilAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_wait_until' as const;

  async evaluate(params: AssertionParams, driver: IDriver, _stepId: string): Promise<AssertionResult> {
    const t0           = Date.now();
    const exp          = expected(params);
    const timeout_ms   = params.timeout_ms      ?? 5_000;
    const interval_ms  = params.poll_interval_ms ?? 500;

    const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    let lastActual = '';
    while (Date.now() - t0 < timeout_ms) {
      try {
        const result  = await driver.execute({ action: 'evaluate', value: 'document.body.innerText' });
        const raw     = result.raw as { text?: string; result?: string } | undefined;
        const content = raw?.text ?? raw?.result ?? '';
        lastActual    = content;
        if (result.success && content.includes(exp)) {
          return applyNegate(makeResult(
            this.kind, 'PASS', exp, exp,
            `Condition met after ${Date.now() - t0}ms: "${exp}" found`,
            Date.now() - t0,
          ), params.negate);
        }
      } catch {
        // keep polling
      }
      await delay(interval_ms);
    }

    return applyNegate(makeResult(
      this.kind, 'FAIL', exp, lastActual,
      `Timed out after ${timeout_ms}ms waiting for "${exp}"`,
      Date.now() - t0,
    ), params.negate);
  }
}
