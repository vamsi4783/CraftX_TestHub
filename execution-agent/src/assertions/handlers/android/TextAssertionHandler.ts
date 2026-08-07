// Asserts that a text string is visible in the Android UI hierarchy.
// raw expected shape: { text: string } or { hierarchy: string }

import type { IDriver }           from '../../../drivers/IDriver.js';
import type { IAssertionHandler } from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../AssertionTypes.js';
import { makeResult, applyNegate, expected } from '../_base.js';

export class TextAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_text' as const;

  async evaluate(params: AssertionParams, driver: IDriver, _stepId: string): Promise<AssertionResult> {
    const t0  = Date.now();
    const exp = expected(params);

    try {
      const result  = await driver.execute({ action: 'get_ui_hierarchy' });
      const raw     = result.raw as { hierarchy?: string; text?: string } | undefined;
      const content = raw?.hierarchy ?? raw?.text ?? '';
      const pass    = result.success && content.includes(exp);

      return applyNegate(makeResult(
        this.kind,
        pass ? 'PASS' : 'FAIL',
        exp,
        pass ? exp : `[not found in hierarchy]`,
        pass ? `Text "${exp}" found in UI` : `Text "${exp}" not found in UI`,
        Date.now() - t0,
      ), params.negate);
    } catch (err) {
      return makeResult(this.kind, 'ERROR', exp, '', err instanceof Error ? err.message : String(err), Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
