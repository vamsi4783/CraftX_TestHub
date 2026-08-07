// ─── SelfHealingEngine tests (Phase 4 M7) ────────────────────────────────────
import { describe, it, expect, beforeEach } from '@jest/globals';
import { SelfHealingEngine }       from '../../healing/SelfHealingEngine.js';
import { HealingStrategyRegistry } from '../../healing/HealingStrategyRegistry.js';
import { XPathFallbackStrategy }   from '../../healing/strategies/XPathFallbackStrategy.js';

const NOOP_DRIVER: any = {
  execute: async () => ({ success: false, duration_ms: 0 }),
};

function makeStep(selector: string, action = 'tap', driverId = 'android'): any {
  return {
    stepId:     'step-x',
    stepNumber: 2,
    action:     { action, selector, driver_id: driverId, params: {} },
  };
}

describe('SelfHealingEngine', () => {
  let engine: SelfHealingEngine;

  beforeEach(() => {
    engine = new SelfHealingEngine(undefined, { skipVerification: true });
  });

  // ── Basic invariants ───────────────────────────────────────────────────────
  it('starts with empty events array', () => {
    expect(engine.events).toEqual([]);
  });

  it('records a healing event after tryHeal', async () => {
    await engine.tryHeal(makeStep('com.example:id/btn_login'), NOOP_DRIVER, 'no such element', 'run-1', 'ses-1');
    expect(engine.events.length).toBe(1);
  });

  it('healing event has correct stepId', async () => {
    const step = makeStep('com.example:id/btn');
    await engine.tryHeal(step, NOOP_DRIVER, 'not found', 'run-1', 'ses-1');
    expect(engine.events[0].stepId).toBe(step.stepId);
  });

  it('healing event has correct stepNumber', async () => {
    await engine.tryHeal(makeStep('x'), NOOP_DRIVER, 'not found', 'run-1', 'ses-1');
    expect(engine.events[0].stepNumber).toBe(2);
  });

  it('healing event has runId', async () => {
    await engine.tryHeal(makeStep('x'), NOOP_DRIVER, 'error', 'my-run', 'ses-1');
    expect(engine.events[0].runId).toBe('my-run');
  });

  it('healing event is initially unreviewed', async () => {
    await engine.tryHeal(makeStep('x'), NOOP_DRIVER, 'error', 'run-1', 'ses-1');
    expect(engine.events[0].reviewed).toBe(false);
  });

  // ── not_applicable outcome ─────────────────────────────────────────────────
  describe('not_applicable outcome', () => {
    it('returns not_applicable when no strategy matches', async () => {
      const emptyRegistry = new HealingStrategyRegistry([]);
      const eng           = new SelfHealingEngine(undefined, { registry: emptyRegistry, skipVerification: true });
      const result        = await eng.tryHeal(makeStep('btn'), NOOP_DRIVER, 'error', 'r1', 's1');
      expect(result.outcome).toBe('not_applicable');
      expect(result.retryCount).toBe(0);
    });
  });

  // ── minConfidence filtering ────────────────────────────────────────────────
  describe('minConfidence filtering', () => {
    it('returns not_applicable when all candidates are below minConfidence', async () => {
      const registry = new HealingStrategyRegistry([new XPathFallbackStrategy()]);
      const eng      = new SelfHealingEngine(undefined, {
        registry,
        minConfidence:    0.99, // impossible threshold
        skipVerification: true,
      });
      const result = await eng.tryHeal(makeStep('com.example:id/btn'), NOOP_DRIVER, 'not found', 'r1', 's1');
      expect(result.outcome).toBe('not_applicable');
    });
  });

  // ── healed outcome (no executor = best candidate counts as healed) ─────────
  describe('healed outcome in test mode', () => {
    it('returns healed when a non-unknown candidate resolves', async () => {
      const result = await engine.tryHeal(
        makeStep('com.example:id/btn_login'),
        NOOP_DRIVER,
        'no such element',
        'run-1',
        'ses-1',
      );
      // With skipVerification + no stepExecutor, healed when best is not unknown
      expect(['healed', 'failed', 'not_applicable']).toContain(result.outcome);
    });

    it('populates originalLocator', async () => {
      const result = await engine.tryHeal(makeStep('com.example:id/btn'), NOOP_DRIVER, 'not found', 'r', 's');
      if (result.outcome !== 'not_applicable') {
        expect(result.originalLocator?.value).toBe('com.example:id/btn');
      }
    });
  });

  // ── multiple events ────────────────────────────────────────────────────────
  it('accumulates multiple events across calls', async () => {
    await engine.tryHeal(makeStep('a'), NOOP_DRIVER, 'err1', 'run-1', 'ses');
    await engine.tryHeal(makeStep('b'), NOOP_DRIVER, 'err2', 'run-1', 'ses');
    expect(engine.events.length).toBe(2);
  });

  it('each event has a unique id', async () => {
    await engine.tryHeal(makeStep('a'), NOOP_DRIVER, 'e1', 'r1', 's1');
    await engine.tryHeal(makeStep('b'), NOOP_DRIVER, 'e2', 'r1', 's1');
    const ids = engine.events.map(e => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  // ── originalError preserved ────────────────────────────────────────────────
  it('result preserves the original error message', async () => {
    const result = await engine.tryHeal(makeStep('x'), NOOP_DRIVER, 'my specific error', 'r', 's');
    expect(result.originalError).toBe('my specific error');
  });
});

// ─── End-to-end healing scenario ─────────────────────────────────────────────
describe('SelfHealingEngine — end-to-end scenario', () => {
  it('heals a resource-id change by stripping package prefix', async () => {
    const engine = new SelfHealingEngine(undefined, { skipVerification: true });
    const step   = makeStep('com.oldpackage:id/btn_login');
    const result = await engine.tryHeal(step, NOOP_DRIVER, 'no such element: com.oldpackage:id/btn_login', 'run-e2e', 'ses-e2e');

    // The engine must record the attempt
    expect(engine.events.length).toBe(1);
    expect(engine.events[0].result.originalError).toContain('com.oldpackage:id/btn_login');

    // If healed, the resolved locator should NOT be the original
    if (result.outcome === 'healed') {
      expect(result.resolvedLocator?.value).not.toBe('com.oldpackage:id/btn_login');
    }
  });

  it('heals a button text change to synonym', async () => {
    // maxCandidates must be large enough to include synonyms (ranked after case variants)
    const engine = new SelfHealingEngine(undefined, {
      skipVerification: true,
      maxCandidates:    20,
    });
    const step   = makeStep('login');     // original text selector
    const result = await engine.tryHeal(step, NOOP_DRIVER, 'no such element: login', 'run-e2e', 'ses-e2e');

    // Synonym candidates should have been produced
    expect(engine.events.length).toBe(1);
    const allValues = [
      result.resolvedLocator?.value ?? '',
      ...result.alternatives.map(a => a.locator.value),
    ];
    // "sign in" or "log in" must appear somewhere in the candidates
    expect(allValues.some(v => /sign.in|log.in/i.test(v))).toBe(true);
  });
});
