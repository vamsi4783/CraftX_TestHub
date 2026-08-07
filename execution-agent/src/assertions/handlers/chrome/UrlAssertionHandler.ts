// Asserts the current page URL matches the expected value (exact or contains).
// raw expected shape: { url: string } or { result: string }

import type { IDriver }           from '../../../drivers/IDriver.js';
import type { IAssertionHandler } from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../AssertionTypes.js';
import { makeResult, applyNegate, expected } from '../_base.js';

export class UrlAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_url' as const;

  async evaluate(params: AssertionParams, driver: IDriver, _stepId: string): Promise<AssertionResult> {
    const t0  = Date.now();
    const exp = expected(params);

    try {
      const result = await driver.execute({ action: 'evaluate', value: 'window.location.href' });
      const raw    = result.raw as { url?: string; result?: string } | undefined;
      const actual = raw?.url ?? raw?.result ?? '';
      const pass   = result.success && (actual === exp || actual.includes(exp));

      return applyNegate(makeResult(
        this.kind,
        pass ? 'PASS' : 'FAIL',
        exp, actual,
        pass ? `URL "${actual}" matches "${exp}"` : `URL is "${actual}", expected "${exp}"`,
        Date.now() - t0,
      ), params.negate);
    } catch (err) {
      return makeResult(this.kind, 'ERROR', exp, '', err instanceof Error ? err.message : String(err), Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
