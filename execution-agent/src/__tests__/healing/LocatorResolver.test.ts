// ─── LocatorResolver tests (Phase 4 M7) ──────────────────────────────────────
import { describe, it, expect } from '@jest/globals';
import { LocatorResolver }       from '../../healing/LocatorResolver.js';
import type { LocatorCandidate } from '../../healing/HealingTypes.js';

function makeCandidate(value: string, confidence: number, strategy = 'xpath_fallback' as const): LocatorCandidate {
  return {
    locator:     { strategy: 'xpath', value },
    confidence,
    explanation: `candidate for "${value}"`,
    strategy,
  };
}

function makeStep(selector: string): any {
  return {
    stepId:     'step-1',
    stepNumber: 1,
    action:     { action: 'tap', selector, driver_id: 'android', params: {} },
  };
}

describe('LocatorResolver', () => {
  const resolver = new LocatorResolver();

  // ── resolve() with skipVerification ────────────────────────────────────────
  describe('resolve() skipVerification=true', () => {
    it('returns empty result when candidates array is empty', async () => {
      const result = await resolver.resolve([], makeStep('btn'), {} as any, true);
      expect(result.verified).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.best).toBeUndefined();
    });

    it('returns the first candidate as best (caller is responsible for pre-sorting)', async () => {
      // LocatorResolver.resolve() takes candidates as-is in skipVerification mode.
      // The registry pre-sorts by confidence before calling resolve().
      const candidates = [
        makeCandidate('//high', 0.8),
        makeCandidate('//mid',  0.6),
        makeCandidate('//low',  0.4),
      ];
      const result = await resolver.resolve(candidates, makeStep('btn'), {} as any, true);
      expect(result.best?.locator.value).toBe('//high');
      expect(result.confidence).toBe(0.8);
    });

    it('remaining candidates go to alternatives', async () => {
      const candidates = [
        makeCandidate('//a', 0.8),
        makeCandidate('//b', 0.5),
        makeCandidate('//c', 0.3),
      ];
      const result = await resolver.resolve(candidates, makeStep('x'), {} as any, true);
      expect(result.alternatives.length).toBe(2);
      expect(result.alternatives.some(c => c.locator.value === '//b')).toBe(true);
    });

    it('sets verified=false in test mode', async () => {
      const result = await resolver.resolve([makeCandidate('//x', 0.9)], makeStep('y'), {} as any, true);
      expect(result.verified).toBe(false);
    });
  });

  // ── resolve() with live driver probing ─────────────────────────────────────
  describe('resolve() with driver that succeeds on first probe', () => {
    it('returns verified=true when driver find_element succeeds', async () => {
      const driver: any = {
        execute: async (req: any) => ({
          success:     req.action === 'find_element',
          duration_ms: 0,
        }),
      };
      const candidates = [makeCandidate('//good', 0.7)];
      const result     = await resolver.resolve(candidates, makeStep('bad'), driver, false);
      expect(result.verified).toBe(true);
      expect(result.best?.locator.value).toBe('//good');
    });

    it('tries next candidate when first probe fails', async () => {
      let callCount = 0;
      const driver: any = {
        execute: async () => {
          callCount++;
          return { success: callCount >= 2, duration_ms: 0 };
        },
      };
      const candidates = [
        makeCandidate('//bad',  0.9),
        makeCandidate('//good', 0.7),
      ];
      const result = await resolver.resolve(candidates, makeStep('orig'), driver, false);
      expect(result.best?.locator.value).toBe('//good');
    });

    it('returns failed result when all probes fail', async () => {
      const driver: any = {
        execute: async () => ({ success: false, duration_ms: 0 }),
      };
      const candidates = [makeCandidate('//a', 0.8), makeCandidate('//b', 0.5)];
      const result     = await resolver.resolve(candidates, makeStep('x'), driver, false);
      expect(result.verified).toBe(false);
      expect(result.best).toBeUndefined();
    });
  });

  // ── "unknown" strategy candidates (wait/scroll — reuse original selector) ──
  describe('resolve() with unknown strategy candidates', () => {
    it('treats unknown-strategy candidate as resolved without probing', async () => {
      const driver: any = { execute: async () => ({ success: false, duration_ms: 0 }) };
      const candidate: LocatorCandidate = {
        locator:     { strategy: 'unknown', value: 'original-selector' },
        confidence:  0.65,
        explanation: 'retry after wait',
        strategy:    'retry_with_wait',
      };
      const result = await resolver.resolve([candidate], makeStep('original-selector'), driver, false);
      expect(result.best?.locator.value).toBe('original-selector');
    });
  });

  // ── buildPatchedStep ────────────────────────────────────────────────────────
  describe('buildPatchedStep()', () => {
    it('returns a new step with updated selector', () => {
      const step      = makeStep('old-selector');
      const candidate = makeCandidate('//new-selector', 0.8, 'xpath_fallback');
      const patched   = resolver.buildPatchedStep(step, candidate);
      expect(patched.action.selector).toBe('//new-selector');
    });

    it('does not mutate the original step', () => {
      const step      = makeStep('original');
      const candidate = makeCandidate('//patched', 0.7, 'xpath_fallback');
      resolver.buildPatchedStep(step, candidate);
      expect(step.action.selector).toBe('original');
    });

    it('injects healing metadata into params', () => {
      const step      = makeStep('original');
      const candidate = makeCandidate('//patched', 0.7, 'xpath_fallback');
      const patched   = resolver.buildPatchedStep(step, candidate);
      expect(patched.action.params?._healing_strategy).toBe('xpath_fallback');
      expect(patched.action.params?._original_selector).toBe('original');
      expect(patched.action.params?._healing_confidence).toBe(0.7);
    });

    it('preserves original step id and number', () => {
      const step      = makeStep('x');
      const candidate = makeCandidate('//y', 0.5, 'button_text_changed');
      const patched   = resolver.buildPatchedStep(step, candidate);
      expect(patched.stepId).toBe(step.stepId);
      expect(patched.stepNumber).toBe(step.stepNumber);
    });
  });
});
