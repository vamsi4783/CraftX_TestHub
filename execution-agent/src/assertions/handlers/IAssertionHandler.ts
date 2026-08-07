// ─── IAssertionHandler ────────────────────────────────────────────────────────
// Every assertion is a pluggable handler implementing this interface.
// Handlers are registered in AssertionRegistry and resolved by AssertionEngine.

import type { IDriver }          from '../../drivers/IDriver.js';
import type { AssertionKind, AssertionParams, AssertionResult } from '../AssertionTypes.js';

export interface IAssertionHandler {
  /** Must match one value of AssertionKind. */
  readonly kind: AssertionKind;
  /**
   * Evaluate the assertion against the current driver state.
   * Must NEVER throw — exceptions are caught by AssertionEngine and
   * converted into an ERROR-status result.
   */
  evaluate(
    params: AssertionParams,
    driver: IDriver,
    stepId: string,
  ): Promise<AssertionResult>;
}
