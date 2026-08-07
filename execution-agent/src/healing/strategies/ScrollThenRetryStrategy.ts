// ─── ScrollThenRetryStrategy (Phase 4 M7) ─────────────────────────────────────
// Scroll down (then up) and retry the original selector.
// Handles elements that are off-screen but present in the DOM/hierarchy.

import type { IDriver }       from '../../drivers/IDriver.js';
import type { ExecutionStep } from '../../execution/ExecutionTypes.js';
import type { HealingCapability, LocatorCandidate } from '../HealingTypes.js';
import type { IHealingStrategy }                   from './IHealingStrategy.js';

const CAPABILITY: HealingCapability = {
  kind:      'scroll_then_retry',
  retryCost: 5,
  priority:  9,
};

// Actions the driver must support for scrolling
const SCROLL_ACTION = 'scroll';

export class ScrollThenRetryStrategy implements IHealingStrategy {
  readonly kind       = 'scroll_then_retry' as const;
  readonly capability = CAPABILITY;

  canHandle(step: ExecutionStep, error: string): boolean {
    const offscreen = /not.*visible|out.*bounds|element.*not.*displayed|off.*screen/i.test(error)
      || /not found|no such element/i.test(error);
    return offscreen && (step.action.selector ?? '').length > 0;
  }

  async getCandidates(
    step:   ExecutionStep,
    driver: IDriver,
    _error: string,
  ): Promise<LocatorCandidate[]> {
    const sel = step.action.selector ?? '';
    if (!sel) return [];

    const candidates: LocatorCandidate[] = [];

    // Attempt scroll down
    try {
      await driver.execute({ action: SCROLL_ACTION, params: { direction: 'down', amount: 300 } });
      await this._wait(500);

      candidates.push({
        locator:     { strategy: 'unknown', value: sel },
        confidence:  0.6,
        explanation: 'Scrolled down 300px then retried original selector',
        strategy:    this.kind,
      });
    } catch {
      // Driver may not support scroll — still emit the candidate for the retry loop
      candidates.push({
        locator:     { strategy: 'unknown', value: sel },
        confidence:  0.35,
        explanation: 'Scroll unavailable; retrying original selector in place',
        strategy:    this.kind,
      });
    }

    // If scroll-down didn't resolve, try scroll-up (element may be above the fold)
    try {
      await driver.execute({ action: SCROLL_ACTION, params: { direction: 'up', amount: 600 } });
      await this._wait(500);

      candidates.push({
        locator:     { strategy: 'unknown', value: sel },
        confidence:  0.5,
        explanation: 'Scrolled up 600px (element may be above fold) then retried',
        strategy:    this.kind,
      });
    } catch {
      // Swallow
    }

    return candidates;
  }

  private _wait(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
