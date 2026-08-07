// ─── ElementIdChangedStrategy (Phase 4 M7) ────────────────────────────────────
// When a resource-id changes, attempt to match by stripping package prefix
// and fuzzy-matching the local id suffix against similar-looking resource ids.

import type { IDriver }       from '../../drivers/IDriver.js';
import type { ExecutionStep } from '../../execution/ExecutionTypes.js';
import type { HealingCapability, LocatorCandidate } from '../HealingTypes.js';
import type { IHealingStrategy }                   from './IHealingStrategy.js';

const CAPABILITY: HealingCapability = {
  kind:      'element_id_changed',
  retryCost: 2,
  priority:  1,
};

export class ElementIdChangedStrategy implements IHealingStrategy {
  readonly kind       = 'element_id_changed' as const;
  readonly capability = CAPABILITY;

  canHandle(step: ExecutionStep, _error: string): boolean {
    const sel = step.action.selector ?? '';
    // Applicable when the selector looks like a resource-id (contains /)
    return sel.includes('/') || sel.startsWith('id/') || /resource.id/i.test(sel);
  }

  async getCandidates(
    step:  ExecutionStep,
    _driver: IDriver,
    _error:  string,
  ): Promise<LocatorCandidate[]> {
    const selector = step.action.selector ?? '';
    const candidates: LocatorCandidate[] = [];

    // ── Strategy A: strip package prefix ─────────────────────────────────────
    // "com.example.app:id/login_button" → "login_button"
    const localId = selector.replace(/^.*[:/]/, '');
    if (localId && localId !== selector) {
      candidates.push({
        locator:     { strategy: 'resource-id', value: localId },
        confidence:  0.65,
        explanation: `Stripped package prefix; trying local id "${localId}"`,
        strategy:    this.kind,
      });
    }

    // ── Strategy B: common id suffix variations ───────────────────────────────
    // e.g. btn_login → loginBtn, login_btn, btnLogin
    const suffixVariants = this._idVariants(localId);
    for (const variant of suffixVariants) {
      if (variant !== localId) {
        candidates.push({
          locator:     { strategy: 'resource-id', value: variant },
          confidence:  0.45,
          explanation: `Id variant: "${variant}" derived from "${localId}"`,
          strategy:    this.kind,
        });
      }
    }

    // ── Strategy C: xpath by @resource-id contains suffix ─────────────────────
    if (localId) {
      candidates.push({
        locator:     { strategy: 'xpath', value: `//*[contains(@resource-id,"${localId}")]` },
        confidence:  0.55,
        explanation: `XPath contains @resource-id "*${localId}"`,
        strategy:    this.kind,
      });
    }

    return candidates;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private _idVariants(id: string): string[] {
    // Convert between snake_case and camelCase patterns
    const variants: string[] = [id];
    if (id.includes('_')) {
      // snake_case → camelCase
      const camel = id.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      variants.push(camel);
      // btn_login → loginBtn (reversed prefix)
      const parts = id.split('_');
      if (parts.length === 2) variants.push(`${parts[1]}_${parts[0]}`);
    } else {
      // camelCase → snake_case
      const snake = id.replace(/([A-Z])/g, '_$1').toLowerCase();
      variants.push(snake);
    }
    return [...new Set(variants)];
  }
}
