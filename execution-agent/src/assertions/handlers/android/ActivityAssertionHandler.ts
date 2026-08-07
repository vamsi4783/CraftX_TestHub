// Asserts the current foreground Android activity matches the expected value.
// Driver call: get_ui_hierarchy with params.type='activity'
// raw expected shape: { activity: string }

import type { IDriver }             from '../../../drivers/IDriver.js';
import type { IAssertionHandler }   from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../AssertionTypes.js';
import { makeResult, applyNegate, expected } from '../_base.js';

export class ActivityAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_activity' as const;

  async evaluate(params: AssertionParams, driver: IDriver, stepId: string): Promise<AssertionResult> {
    const t0  = Date.now();
    const exp = expected(params);

    try {
      const result = await driver.execute({
        action: 'get_ui_hierarchy',
        params: { type: 'activity' },
      });

      const raw    = result.raw as { activity?: string } | undefined;
      const actual = raw?.activity ?? (result.success ? 'unknown' : '');

      const pass = result.success && actual.includes(exp);
      return applyNegate(makeResult(
        this.kind,
        pass ? 'PASS' : 'FAIL',
        exp,
        actual,
        pass
          ? `Activity "${actual}" matches "${exp}"`
          : `Activity "${actual}" does not match "${exp}"`,
        Date.now() - t0,
      ), params.negate);
    } catch (err) {
      return makeResult(this.kind, 'ERROR', exp, '', err instanceof Error ? err.message : String(err), Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
