// ─── NearbyElementSimilarityStrategy (Phase 4 M7) ─────────────────────────────
// When the direct selector fails, look for a sibling element that is structurally
// similar — same element type, same parent container, adjacent index.

import type { IDriver }       from '../../drivers/IDriver.js';
import type { ExecutionStep } from '../../execution/ExecutionTypes.js';
import type { HealingCapability, LocatorCandidate } from '../HealingTypes.js';
import type { IHealingStrategy }                   from './IHealingStrategy.js';

const CAPABILITY: HealingCapability = {
  kind:      'nearby_element_similarity',
  retryCost: 4,
  priority:  7,
};

export class NearbyElementSimilarityStrategy implements IHealingStrategy {
  readonly kind       = 'nearby_element_similarity' as const;
  readonly capability = CAPABILITY;

  canHandle(step: ExecutionStep, _error: string): boolean {
    const sel = step.action.selector ?? '';
    // Applicable for xpath expressions that reference a specific element type
    return sel.startsWith('/') && /\/\/([\w.]+)/.test(sel);
  }

  async getCandidates(
    step:    ExecutionStep,
    _driver: IDriver,
    _error:  string,
  ): Promise<LocatorCandidate[]> {
    const sel        = step.action.selector ?? '';
    const candidates: LocatorCandidate[] = [];

    // Extract element type from XPath (e.g. //android.widget.Button → android.widget.Button)
    const typeMatch = /\/\/([\w.]+)/.exec(sel);
    if (!typeMatch) return candidates;

    const elementType = typeMatch[1];

    // ── Try parent's children of same type ────────────────────────────────────
    // //android.widget.Button[@resource-id="x"] → ../android.widget.Button
    const withParent = sel.replace(/^\/\/(\w[\w.]*)(\[.+\])?$/, '//$1/..//$1');
    if (withParent !== sel) {
      candidates.push({
        locator:     { strategy: 'xpath', value: withParent },
        confidence:  0.4,
        explanation: `Sibling ${elementType} in same parent via XPath traversal`,
        strategy:    this.kind,
      });
    }

    // ── First element of same type in the screen ───────────────────────────────
    candidates.push({
      locator:     { strategy: 'xpath', value: `//${elementType}[1]` },
      confidence:  0.3,
      explanation: `First ${elementType} on screen`,
      strategy:    this.kind,
    });

    // ── Same type with a text/label predicate stripped to just the type ────────
    const typeOnly = `//${elementType}`;
    candidates.push({
      locator:     { strategy: 'xpath', value: typeOnly },
      confidence:  0.25,
      explanation: `All ${elementType} elements (widened query)`,
      strategy:    this.kind,
    });

    // ── Android class-name fallback ───────────────────────────────────────────
    if (elementType.includes('.')) {
      // android.widget.Button → class-name: android.widget.Button
      candidates.push({
        locator:     { strategy: 'class-name', value: elementType },
        confidence:  0.35,
        explanation: `Class-name selector: "${elementType}"`,
        strategy:    this.kind,
      });
    }

    return candidates;
  }
}
