// ─── CssSelectorFallbackStrategy (Phase 4 M7) ─────────────────────────────────
// When an XPath or resource-id selector fails in a web context,
// derive CSS selector alternatives.

import type { IDriver }       from '../../drivers/IDriver.js';
import type { ExecutionStep } from '../../execution/ExecutionTypes.js';
import type { HealingCapability, LocatorCandidate } from '../HealingTypes.js';
import type { IHealingStrategy }                   from './IHealingStrategy.js';

const CAPABILITY: HealingCapability = {
  kind:      'css_selector_fallback',
  retryCost: 2,
  priority:  4,
};

export class CssSelectorFallbackStrategy implements IHealingStrategy {
  readonly kind       = 'css_selector_fallback' as const;
  readonly capability = CAPABILITY;

  canHandle(step: ExecutionStep, _error: string): boolean {
    const sel      = step.action.selector ?? '';
    const driverId = step.action.driver_id ?? '';
    // Only applicable for web (Chrome) drivers
    return (driverId.toLowerCase().includes('chrome') ||
            driverId.toLowerCase().includes('web')) &&
           sel.length > 0;
  }

  async getCandidates(
    step:    ExecutionStep,
    _driver: IDriver,
    _error:  string,
  ): Promise<LocatorCandidate[]> {
    const sel        = step.action.selector ?? '';
    const candidates: LocatorCandidate[] = [];

    if (!sel) return candidates;

    // ── XPath → CSS ───────────────────────────────────────────────────────────
    if (sel.startsWith('/')) {
      // //*[@id="foo"] → #foo
      const idMatch = /@id=["']([^"']+)["']/.exec(sel);
      if (idMatch) {
        candidates.push({
          locator:     { strategy: 'css', value: `#${idMatch[1]}` },
          confidence:  0.85,
          explanation: `CSS id selector "#${idMatch[1]}" derived from XPath @id`,
          strategy:    this.kind,
        });
      }

      // //*[contains(@class,"foo")] → .foo
      const classMatch = /contains\(@class,["']([^"']+)["']\)/.exec(sel);
      if (classMatch) {
        candidates.push({
          locator:     { strategy: 'css', value: `.${classMatch[1]}` },
          confidence:  0.7,
          explanation: `CSS class selector ".${classMatch[1]}" derived from XPath @class`,
          strategy:    this.kind,
        });
      }

      // //button[@type="submit"] → button[type="submit"]
      const tagAttrMatch = /\/\/(\w+)\[@(\w+)=["']([^"']+)["']\]/.exec(sel);
      if (tagAttrMatch) {
        const [, tag, attr, val] = tagAttrMatch;
        candidates.push({
          locator:     { strategy: 'css', value: `${tag}[${attr}="${val}"]` },
          confidence:  0.75,
          explanation: `CSS attribute selector "${tag}[${attr}="${val}"]"`,
          strategy:    this.kind,
        });
      }

      return candidates;
    }

    // ── Plain text / resource-id → CSS data-* or name attributes ─────────────
    const localId = sel.replace(/^.*[:/]/, '');
    if (localId) {
      candidates.push({
        locator:     { strategy: 'css', value: `[data-testid="${localId}"]` },
        confidence:  0.6,
        explanation: `CSS [data-testid] for "${localId}"`,
        strategy:    this.kind,
      });
      candidates.push({
        locator:     { strategy: 'css', value: `[name="${localId}"]` },
        confidence:  0.55,
        explanation: `CSS [name] attribute for "${localId}"`,
        strategy:    this.kind,
      });
      candidates.push({
        locator:     { strategy: 'css', value: `[aria-label="${localId}"]` },
        confidence:  0.5,
        explanation: `CSS [aria-label] for "${localId}"`,
        strategy:    this.kind,
      });
    }

    return candidates;
  }
}
