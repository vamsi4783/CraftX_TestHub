// ─── IHealingStrategy (Phase 4 M7) ────────────────────────────────────────────
// Contract that every healing strategy must implement.

import type { IDriver }           from '../../drivers/IDriver.js';
import type { ExecutionStep }     from '../../execution/ExecutionTypes.js';
import type {
  HealingCapability,
  HealingStrategyKind,
  LocatorCandidate,
} from '../HealingTypes.js';

export interface IHealingStrategy {
  readonly kind:       HealingStrategyKind;
  readonly capability: HealingCapability;

  /**
   * Determine whether this strategy can handle the given failure.
   * Cheap check — no driver calls.
   */
  canHandle(step: ExecutionStep, error: string): boolean;

  /**
   * Produce candidate locators for the failed step.
   * May issue driver calls (e.g. scroll, findElements).
   */
  getCandidates(
    step:   ExecutionStep,
    driver: IDriver,
    error:  string,
  ): Promise<LocatorCandidate[]>;
}
