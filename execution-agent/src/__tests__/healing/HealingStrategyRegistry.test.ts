// ─── HealingStrategyRegistry tests (Phase 4 M7) ───────────────────────────────
import { describe, it, expect, beforeEach } from '@jest/globals';
import { HealingStrategyRegistry } from '../../healing/HealingStrategyRegistry.js';
import { ElementIdChangedStrategy } from '../../healing/strategies/ElementIdChangedStrategy.js';
import { XPathFallbackStrategy }    from '../../healing/strategies/XPathFallbackStrategy.js';

function makeStep(selector: string, action = 'tap', driverId = 'android') {
  return {
    stepId:     'step-1',
    stepNumber: 1,
    action:     { action, selector, driver_id: driverId, params: {} },
  } as any;
}

describe('HealingStrategyRegistry', () => {
  let registry: HealingStrategyRegistry;

  beforeEach(() => {
    registry = new HealingStrategyRegistry();
  });

  it('registers all 10 default strategies', () => {
    expect(registry.count).toBe(10);
  });

  it('has() returns true for every default kind', () => {
    const kinds = [
      'element_id_changed', 'button_text_changed', 'relative_position_shift',
      'xpath_fallback', 'css_selector_fallback', 'accessibility_label_fallback',
      'nearby_element_similarity', 'retry_with_wait', 'scroll_then_retry',
      'visibility_retry',
    ] as const;
    for (const kind of kinds) {
      expect(registry.has(kind)).toBe(true);
    }
  });

  it('select() returns strategies ordered by priority', () => {
    const step     = makeStep('com.example:id/btn_login');
    const selected = registry.select(step, 'Element not found');
    for (let i = 1; i < selected.length; i++) {
      expect(selected[i].capability.priority).toBeGreaterThanOrEqual(selected[i - 1].capability.priority);
    }
  });

  it('select() returns only strategies whose canHandle() is true', () => {
    // Positional xpath step should NOT trigger xpath_fallback (which requires non-xpath selector)
    const step     = makeStep('//android.widget.Button[2]');
    const selected = registry.select(step, 'Element not found');
    const kinds    = selected.map(s => s.kind);
    // xpath_fallback requires non-xpath selector — must be excluded
    expect(kinds).not.toContain('xpath_fallback');
    // relative_position_shift requires positional predicate [N] — must be included
    expect(kinds).toContain('relative_position_shift');
    // Every returned strategy declares it can handle this step
    for (const s of selected) {
      expect(s.canHandle(step, 'Element not found')).toBe(true);
    }
  });

  it('register() adds a custom strategy', () => {
    const custom = new ElementIdChangedStrategy();
    const reg2   = new HealingStrategyRegistry([]);
    expect(reg2.count).toBe(0);
    reg2.register(custom);
    expect(reg2.count).toBe(1);
    expect(reg2.has('element_id_changed')).toBe(true);
  });

  it('can be constructed with custom strategy list', () => {
    const reg = new HealingStrategyRegistry([new XPathFallbackStrategy()]);
    expect(reg.count).toBe(1);
    expect(reg.has('xpath_fallback')).toBe(true);
    expect(reg.has('button_text_changed')).toBe(false);
  });

  describe('gatherCandidates()', () => {
    it('returns candidates sorted by confidence descending', async () => {
      const step   = makeStep('com.example:id/btn_login');
      const driver = { execute: async () => ({ success: false, duration_ms: 0 }) } as any;
      const cands  = await registry.gatherCandidates(step, driver, 'no such element');
      for (let i = 1; i < cands.length; i++) {
        expect(cands[i].confidence).toBeLessThanOrEqual(cands[i - 1].confidence);
      }
    });

    it('deduplicates candidates with the same locator value', async () => {
      const step   = makeStep('com.example:id/btn_login');
      const driver = { execute: async () => ({ success: false, duration_ms: 0 }) } as any;
      const cands  = await registry.gatherCandidates(step, driver, 'no such element');
      const keys   = cands.map(c => `${c.locator.strategy}:${c.locator.value}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(keys.length);
    });

    it('returns empty array when no strategy is applicable', async () => {
      const reg    = new HealingStrategyRegistry([]);
      const step   = makeStep('');
      const driver = { execute: async () => ({ success: false, duration_ms: 0 }) } as any;
      const cands  = await reg.gatherCandidates(step, driver, 'error');
      expect(cands).toEqual([]);
    });
  });
});
