// Tests a value against a regular expression — no driver call required.
// params.value is the string to test; params.regex is the pattern.

import type { IDriver }           from '../../../drivers/IDriver.js';
import type { IAssertionHandler } from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../AssertionTypes.js';
import { makeResult, applyNegate } from '../_base.js';

export class RegexMatchAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_regex_match' as const;

  async evaluate(params: AssertionParams, _driver: IDriver, _stepId: string): Promise<AssertionResult> {
    const t0      = Date.now();
    const pattern = params.regex ?? params.expected ?? '';
    const value   = params.value ?? '';

    try {
      const re   = new RegExp(pattern);
      const pass = re.test(value);

      return applyNegate(makeResult(
        this.kind,
        pass ? 'PASS' : 'FAIL',
        pattern, value,
        pass
          ? `"${value}" matches /${pattern}/`
          : `"${value}" does not match /${pattern}/`,
        Date.now() - t0,
      ), params.negate);
    } catch (err) {
      return makeResult(this.kind, 'ERROR', pattern, value,
        `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
        Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
