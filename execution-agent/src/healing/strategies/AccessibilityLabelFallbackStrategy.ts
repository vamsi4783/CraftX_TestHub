// ─── AccessibilityLabelFallbackStrategy (Phase 4 M7) ──────────────────────────
// Try content-description (Android) / aria-label (Web) as an alternative
// when the primary selector fails.

import type { IDriver }       from '../../drivers/IDriver.js';
import type { ExecutionStep } from '../../execution/ExecutionTypes.js';
import type { HealingCapability, LocatorCandidate } from '../HealingTypes.js';
import type { IHealingStrategy }                   from './IHealingStrategy.js';

const CAPABILITY: HealingCapability = {
  kind:      'accessibility_label_fallback',
  retryCost: 2,
  priority:  6,
};

export class AccessibilityLabelFallbackStrategy implements IHealingStrategy {
  readonly kind       = 'accessibility_label_fallback' as const;
  readonly capability = CAPABILITY;

  canHandle(step: ExecutionStep, _error: string): boolean {
    const sel = step.action.selector ?? '';
    // Skip if selector already IS an accessibility-id or content-desc xpath
    return sel.length > 0 &&
      !sel.includes('@content-desc') &&
      !sel.includes('@accessibility') &&
      !sel.includes('aria-label');
  }

  async getCandidates(
    step:    ExecutionStep,
    _driver: IDriver,
    _error:  string,
  ): Promise<LocatorCandidate[]> {
    const sel        = step.action.selector ?? '';
    const candidates: LocatorCandidate[] = [];

    if (!sel) return candidates;

    // Derive a human-readable label from the selector
    const label = sel
      .replace(/^.*[:/]/, '')              // strip package prefix
      .replace(/[_-]/g, ' ')              // underscores → spaces
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → words
      .replace(/\s+/g, ' ')
      .trim();

    if (!label) return candidates;

    // ── Android: @content-desc ─────────────────────────────────────────────────
    candidates.push({
      locator:     { strategy: 'accessibility-id', value: label },
      confidence:  0.6,
      explanation: `Accessibility-id "${label}" derived from selector "${sel}"`,
      strategy:    this.kind,
    });

    candidates.push({
      locator:     { strategy: 'xpath', value: `//*[@content-desc="${label}"]` },
      confidence:  0.6,
      explanation: `XPath @content-desc="${label}"`,
      strategy:    this.kind,
    });

    candidates.push({
      locator:     { strategy: 'xpath', value: `//*[contains(@content-desc,"${label}")]` },
      confidence:  0.5,
      explanation: `XPath @content-desc contains "${label}"`,
      strategy:    this.kind,
    });

    // ── Web: aria-label ────────────────────────────────────────────────────────
    candidates.push({
      locator:     { strategy: 'css', value: `[aria-label="${label}"]` },
      confidence:  0.55,
      explanation: `CSS [aria-label="${label}"]`,
      strategy:    this.kind,
    });

    candidates.push({
      locator:     { strategy: 'xpath', value: `//*[@aria-label="${label}"]` },
      confidence:  0.55,
      explanation: `XPath @aria-label="${label}"`,
      strategy:    this.kind,
    });

    // Also try title-cased label
    const titled = label.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    if (titled !== label) {
      candidates.push({
        locator:     { strategy: 'accessibility-id', value: titled },
        confidence:  0.5,
        explanation: `Accessibility-id title-cased: "${titled}"`,
        strategy:    this.kind,
      });
    }

    return candidates;
  }
}
