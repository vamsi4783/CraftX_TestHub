// ─── VisibilityRetryStrategy (Phase 4 M7) ─────────────────────────────────────
// When an element is present but not yet visible (loading overlay, animation,
// conditional render), retry with an XPath visibility guard predicate.

import type { IDriver }       from '../../drivers/IDriver.js';
import type { ExecutionStep } from '../../execution/ExecutionTypes.js';
import type { HealingCapability, LocatorCandidate } from '../HealingTypes.js';
import type { IHealingStrategy }                   from './IHealingStrategy.js';

const CAPABILITY: HealingCapability = {
  kind:      'visibility_retry',
  retryCost: 3,
  priority:  10,
};

export class VisibilityRetryStrategy implements IHealingStrategy {
  readonly kind       = 'visibility_retry' as const;
  readonly capability = CAPABILITY;

  canHandle(_step: ExecutionStep, error: string): boolean {
    return /not.*visible|invisible|hidden|display.*none|opacity.*0|not.*interactable/i.test(error);
  }

  async getCandidates(
    step:    ExecutionStep,
    _driver: IDriver,
    _error:  string,
  ): Promise<LocatorCandidate[]> {
    const sel        = step.action.selector ?? '';
    const candidates: LocatorCandidate[] = [];

    if (!sel) return candidates;

    // ── Android: filter by @displayed="true" ──────────────────────────────────
    if (sel.startsWith('/')) {
      const withDisplayed = sel.endsWith(']')
        ? sel.replace(/\]$/, ' and @displayed="true"]')
        : `${sel}[@displayed="true"]`;

      candidates.push({
        locator:     { strategy: 'xpath', value: withDisplayed },
        confidence:  0.65,
        explanation: 'XPath with @displayed="true" guard to skip invisible elements',
        strategy:    this.kind,
      });

      const withEnabled = sel.endsWith(']')
        ? sel.replace(/\]$/, ' and @enabled="true"]')
        : `${sel}[@enabled="true"]`;

      candidates.push({
        locator:     { strategy: 'xpath', value: withEnabled },
        confidence:  0.6,
        explanation: 'XPath with @enabled="true" guard',
        strategy:    this.kind,
      });
    }

    // ── Web: CSS :not([hidden]) / :visible ────────────────────────────────────
    if (sel.startsWith('#') || sel.startsWith('.') || /^\w/.test(sel)) {
      candidates.push({
        locator:     { strategy: 'css', value: `${sel}:not([hidden]):not([disabled])` },
        confidence:  0.6,
        explanation: `CSS "${sel}:not([hidden]):not([disabled])" — visible elements only`,
        strategy:    this.kind,
      });
    }

    // ── Fallback: original selector after a short wait ─────────────────────────
    await this._wait(800);
    candidates.push({
      locator:     { strategy: 'unknown', value: sel },
      confidence:  0.5,
      explanation: 'Retried original selector after 800ms visibility delay',
      strategy:    this.kind,
    });

    return candidates;
  }

  private _wait(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
