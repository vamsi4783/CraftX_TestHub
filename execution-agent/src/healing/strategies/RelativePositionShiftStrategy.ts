// ─── RelativePositionShiftStrategy (Phase 4 M7) ───────────────────────────────
// When an element's index shifts in a list/grid, try adjacent sibling positions.

import type { IDriver }       from '../../drivers/IDriver.js';
import type { ExecutionStep } from '../../execution/ExecutionTypes.js';
import type { HealingCapability, LocatorCandidate } from '../HealingTypes.js';
import type { IHealingStrategy }                   from './IHealingStrategy.js';

const CAPABILITY: HealingCapability = {
  kind:      'relative_position_shift',
  retryCost: 3,
  priority:  5,
};

// Detects xpath positional predicates like [2] or [position()=2]
const POSITIONAL_XPATH = /\[(\d+)\]|\[position\(\)\s*=\s*(\d+)\]/;

export class RelativePositionShiftStrategy implements IHealingStrategy {
  readonly kind       = 'relative_position_shift' as const;
  readonly capability = CAPABILITY;

  canHandle(step: ExecutionStep, _error: string): boolean {
    const sel = step.action.selector ?? '';
    return POSITIONAL_XPATH.test(sel);
  }

  async getCandidates(
    step:    ExecutionStep,
    _driver: IDriver,
    _error:  string,
  ): Promise<LocatorCandidate[]> {
    const sel   = step.action.selector ?? '';
    const match = POSITIONAL_XPATH.exec(sel);
    if (!match) return [];

    const currentIndex = parseInt(match[1] ?? match[2] ?? '1', 10);
    const candidates: LocatorCandidate[] = [];

    // Try adjacent positions: ±1, ±2
    for (const delta of [-1, 1, -2, 2]) {
      const newIndex = currentIndex + delta;
      if (newIndex < 1) continue;

      const newSel = sel.replace(POSITIONAL_XPATH, `[${newIndex}]`);
      const confidence = Math.abs(delta) === 1 ? 0.6 : 0.4;

      candidates.push({
        locator:     { strategy: 'xpath', value: newSel },
        confidence,
        explanation: `Position shift Δ${delta > 0 ? '+' : ''}${delta}: index ${currentIndex} → ${newIndex}`,
        strategy:    this.kind,
      });
    }

    // Also try without the positional predicate (first match)
    const withoutIndex = sel.replace(POSITIONAL_XPATH, '');
    candidates.push({
      locator:     { strategy: 'xpath', value: withoutIndex },
      confidence:  0.35,
      explanation: 'Removed positional predicate — returns first matching element',
      strategy:    this.kind,
    });

    return candidates;
  }
}
