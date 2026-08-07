// ─── RetryWithWaitStrategy (Phase 4 M7) ───────────────────────────────────────
// Retry the original selector after a configurable wait.
// Handles elements that are temporarily not present (animations, async loading).

import type { IDriver }       from '../../drivers/IDriver.js';
import type { ExecutionStep } from '../../execution/ExecutionTypes.js';
import type { HealingCapability, LocatorCandidate } from '../HealingTypes.js';
import type { IHealingStrategy }                   from './IHealingStrategy.js';

const CAPABILITY: HealingCapability = {
  kind:      'retry_with_wait',
  retryCost: 3,
  priority:  8,
};

export class RetryWithWaitStrategy implements IHealingStrategy {
  readonly kind       = 'retry_with_wait' as const;
  readonly capability = CAPABILITY;

  constructor(
    private readonly waitMs: number = 1_500,
  ) {}

  canHandle(step: ExecutionStep, error: string): boolean {
    // Applicable for transient "not found" / "not visible" errors on any selector
    const transient = /not found|no such element|element not|timeout|stale/i.test(error);
    return transient && (step.action.selector ?? '').length > 0;
  }

  async getCandidates(
    step:   ExecutionStep,
    driver: IDriver,
    _error: string,
  ): Promise<LocatorCandidate[]> {
    const sel = step.action.selector ?? '';
    if (!sel) return [];

    // Wait for the configured delay
    await this._wait(this.waitMs);

    // Return the original selector unchanged — the wait is the healing action
    return [
      {
        locator:     { strategy: 'unknown', value: sel },
        confidence:  0.65,
        explanation: `Retried after ${this.waitMs}ms wait (async load / animation)`,
        strategy:    this.kind,
      },
    ];
  }

  private _wait(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
