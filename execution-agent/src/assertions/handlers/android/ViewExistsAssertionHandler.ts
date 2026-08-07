// Asserts a view (by resource-id, xpath, or text) exists in the UI hierarchy.
// raw expected shape: { found: boolean; selector?: string }

import type { IDriver }           from '../../../drivers/IDriver.js';
import type { IAssertionHandler } from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../AssertionTypes.js';
import { makeResult, applyNegate } from '../_base.js';

export class ViewExistsAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_view_exists' as const;

  async evaluate(params: AssertionParams, driver: IDriver, _stepId: string): Promise<AssertionResult> {
    const t0       = Date.now();
    const selector = params.selector ?? params.expected ?? '';

    try {
      const result = await driver.execute({ action: 'get_ui_hierarchy', selector });
      const raw    = result.raw as { found?: boolean } | undefined;
      const found  = raw?.found !== undefined ? raw.found : result.success;

      return applyNegate(makeResult(
        this.kind,
        found ? 'PASS' : 'FAIL',
        selector,
        found ? selector : '[not found]',
        found ? `View "${selector}" exists` : `View "${selector}" not found in hierarchy`,
        Date.now() - t0,
      ), params.negate);
    } catch (err) {
      return makeResult(this.kind, 'ERROR', selector, '', err instanceof Error ? err.message : String(err), Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
