// Asserts the current foreground Android package matches the expected value.
// raw expected shape: { package: string }

import type { IDriver }           from '../../../drivers/IDriver.js';
import type { IAssertionHandler } from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../AssertionTypes.js';
import { makeResult, applyNegate, expected } from '../_base.js';

export class PackageAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_package' as const;

  async evaluate(params: AssertionParams, driver: IDriver, _stepId: string): Promise<AssertionResult> {
    const t0  = Date.now();
    const exp = expected(params);

    try {
      const result = await driver.execute({ action: 'get_ui_hierarchy', params: { type: 'package' } });
      const raw    = result.raw as { package?: string } | undefined;
      const actual = raw?.package ?? '';
      const pass   = result.success && actual === exp;

      return applyNegate(makeResult(
        this.kind,
        pass ? 'PASS' : 'FAIL',
        exp, actual,
        pass ? `Package "${actual}" is active` : `Expected package "${exp}" but found "${actual}"`,
        Date.now() - t0,
      ), params.negate);
    } catch (err) {
      return makeResult(this.kind, 'ERROR', exp, '', err instanceof Error ? err.message : String(err), Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
