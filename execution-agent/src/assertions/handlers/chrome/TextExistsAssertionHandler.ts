// Asserts a text string exists anywhere on the Chrome page.
// raw expected shape: { text: string } (full page text)

import type { IDriver }           from '../../../drivers/IDriver.js';
import type { IAssertionHandler } from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../AssertionTypes.js';
import { makeResult, applyNegate, expected } from '../_base.js';

export class TextExistsAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_text_exists' as const;

  async evaluate(params: AssertionParams, driver: IDriver, _stepId: string): Promise<AssertionResult> {
    const t0  = Date.now();
    const exp = expected(params);

    try {
      const result  = await driver.execute({ action: 'evaluate', value: 'document.body.innerText' });
      const raw     = result.raw as { text?: string; result?: string } | undefined;
      const content = raw?.text ?? raw?.result ?? '';
      const pass    = result.success && content.includes(exp);

      return applyNegate(makeResult(
        this.kind,
        pass ? 'PASS' : 'FAIL',
        exp,
        pass ? exp : '[not found]',
        pass ? `Text "${exp}" found on page` : `Text "${exp}" not found on page`,
        Date.now() - t0,
      ), params.negate);
    } catch (err) {
      return makeResult(this.kind, 'ERROR', exp, '', err instanceof Error ? err.message : String(err), Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
