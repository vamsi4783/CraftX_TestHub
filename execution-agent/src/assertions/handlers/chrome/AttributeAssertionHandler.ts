// Asserts an element attribute has the expected value.
// raw expected shape: { value: string }

import type { IDriver }           from '../../../drivers/IDriver.js';
import type { IAssertionHandler } from '../IAssertionHandler.js';
import type { AssertionParams, AssertionResult } from '../../AssertionTypes.js';
import { makeResult, applyNegate, expected } from '../_base.js';

export class AttributeAssertionHandler implements IAssertionHandler {
  readonly kind = 'assert_attribute' as const;

  async evaluate(params: AssertionParams, driver: IDriver, _stepId: string): Promise<AssertionResult> {
    const t0        = Date.now();
    const selector  = params.selector ?? '';
    const attribute = params.attribute ?? 'value';
    const exp       = expected(params);

    try {
      const script = `
        (function(){
          var el = document.querySelector(${JSON.stringify(selector)});
          return el ? el.getAttribute(${JSON.stringify(attribute)}) : null;
        })()
      `;
      const result = await driver.execute({ action: 'evaluate', value: script, selector });
      const raw    = result.raw as { result?: string | null; value?: string | null } | undefined;
      const actual = String(raw?.result ?? raw?.value ?? '');
      const pass   = result.success && actual === exp;

      return applyNegate(makeResult(
        this.kind,
        pass ? 'PASS' : 'FAIL',
        exp, actual,
        pass
          ? `Attribute "${attribute}" on "${selector}" equals "${exp}"`
          : `Attribute "${attribute}" on "${selector}" is "${actual}", expected "${exp}"`,
        Date.now() - t0,
      ), params.negate);
    } catch (err) {
      return makeResult(this.kind, 'ERROR', exp, '', err instanceof Error ? err.message : String(err), Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
