// Pure value comparison — no driver call required.
// params.value is the actual value to compare; params.expected is the expected value.

import type { IDriver }           from '../../../drivers/IDriver.js';
import type { IAssertionHandler } from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../AssertionTypes.js';
import { makeResult, applyNegate } from '../_base.js';

export class ValueEqualsAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_value_equals' as const;

  async evaluate(params: AssertionParams, _driver: IDriver, _stepId: string): Promise<AssertionResult> {
    const t0     = Date.now();
    const exp    = params.expected ?? '';
    const actual = params.value    ?? '';
    const pass   = actual === exp;

    return applyNegate(makeResult(
      this.kind,
      pass ? 'PASS' : 'FAIL',
      exp, actual,
      pass ? `Value "${actual}" equals "${exp}"` : `Value "${actual}" does not equal "${exp}"`,
      Date.now() - t0,
    ), params.negate);
  }
}
