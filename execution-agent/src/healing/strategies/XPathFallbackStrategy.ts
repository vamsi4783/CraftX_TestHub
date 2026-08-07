// ─── XPathFallbackStrategy (Phase 4 M7) ───────────────────────────────────────
// When a resource-id or CSS selector fails, derive equivalent XPath expressions.

import type { IDriver }       from '../../drivers/IDriver.js';
import type { ExecutionStep } from '../../execution/ExecutionTypes.js';
import type { HealingCapability, LocatorCandidate } from '../HealingTypes.js';
import type { IHealingStrategy }                   from './IHealingStrategy.js';

const CAPABILITY: HealingCapability = {
  kind:      'xpath_fallback',
  retryCost: 2,
  priority:  3,
};

export class XPathFallbackStrategy implements IHealingStrategy {
  readonly kind       = 'xpath_fallback' as const;
  readonly capability = CAPABILITY;

  canHandle(step: ExecutionStep, _error: string): boolean {
    const sel = step.action.selector ?? '';
    // Applicable when the current selector is NOT already an xpath expression
    return sel.length > 0 && !sel.startsWith('/') && !sel.startsWith('(');
  }

  async getCandidates(
    step:    ExecutionStep,
    _driver: IDriver,
    _error:  string,
  ): Promise<LocatorCandidate[]> {
    const sel        = step.action.selector ?? '';
    const candidates: LocatorCandidate[] = [];

    if (!sel) return candidates;

    // ── Resource-id → XPath ───────────────────────────────────────────────────
    if (sel.includes('/') || sel.startsWith('id/')) {
      const localId = sel.replace(/^.*[:/]/, '');

      // Exact match
      candidates.push({
        locator:     { strategy: 'xpath', value: `//*[@resource-id="${sel}"]` },
        confidence:  0.8,
        explanation: `XPath @resource-id exact match for "${sel}"`,
        strategy:    this.kind,
      });

      // Contains match (handles package prefix variation)
      candidates.push({
        locator:     { strategy: 'xpath', value: `//*[contains(@resource-id,"${localId}")]` },
        confidence:  0.65,
        explanation: `XPath @resource-id contains "${localId}"`,
        strategy:    this.kind,
      });

      return candidates;
    }

    // ── CSS → XPath ───────────────────────────────────────────────────────────
    if (sel.startsWith('#')) {
      // #myId → //*[@id="myId"]
      const id = sel.slice(1);
      candidates.push({
        locator:     { strategy: 'xpath', value: `//*[@id="${id}"]` },
        confidence:  0.85,
        explanation: `XPath @id from CSS id selector "#${id}"`,
        strategy:    this.kind,
      });
      candidates.push({
        locator:     { strategy: 'xpath', value: `//*[contains(@id,"${id}")]` },
        confidence:  0.6,
        explanation: `XPath @id contains "${id}"`,
        strategy:    this.kind,
      });
      return candidates;
    }

    if (sel.startsWith('.')) {
      // .myClass → //*[contains(@class,"myClass")]
      const cls = sel.replace(/^\./, '').split('.')[0];
      candidates.push({
        locator:     { strategy: 'xpath', value: `//*[contains(@class,"${cls}")]` },
        confidence:  0.7,
        explanation: `XPath @class contains "${cls}"`,
        strategy:    this.kind,
      });
      return candidates;
    }

    // ── Plain text → XPath text() ─────────────────────────────────────────────
    candidates.push({
      locator:     { strategy: 'xpath', value: `//*[text()="${sel}"]` },
      confidence:  0.6,
      explanation: `XPath text() exact match for "${sel}"`,
      strategy:    this.kind,
    });
    candidates.push({
      locator:     { strategy: 'xpath', value: `//*[contains(text(),"${sel}")]` },
      confidence:  0.5,
      explanation: `XPath text() contains "${sel}"`,
      strategy:    this.kind,
    });

    return candidates;
  }
}
