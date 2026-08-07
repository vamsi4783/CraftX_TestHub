// Asserts a DOM element exists in the Chrome page.
// raw expected shape: { exists: boolean }

import type { IDriver }           from '../../../drivers/IDriver.js';
import type { IAssertionHandler } from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../AssertionTypes.js';
import { makeResult, applyNegate } from '../_base.js';

export class ElementExistsAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_element_exists' as const;

  async evaluate(params: AssertionParams, driver: IDriver, _stepId: string): Promise<AssertionResult> {
    const t0       = Date.now();
    const selector = params.selector ?? params.expected ?? '';

    try {
      const result = await driver.execute({
        action:   'evaluate',
        value:    `document.querySelector(${JSON.stringify(selector)}) !== null`,
        selector,
      });
      const raw    = result.raw as { result?: boolean; exists?: boolean } | undefined;
      const exists = raw?.exists ?? raw?.result ?? result.success;

      return applyNegate(makeResult(
        this.kind,
        exists ? 'PASS' : 'FAIL',
        selector,
        exists ? selector : '[not found]',
        exists ? `Element "${selector}" exists in DOM` : `Element "${selector}" not found in DOM`,
        Date.now() - t0,
      ), params.negate);
    } catch (err) {
      return makeResult(this.kind, 'ERROR', selector, '', err instanceof Error ? err.message : String(err), Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
