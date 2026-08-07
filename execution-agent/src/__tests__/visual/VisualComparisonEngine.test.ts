// ─── VisualComparisonEngine Tests ─────────────────────────────────────────────

import { describe, it, expect, beforeEach } from '@jest/globals';
import { VisualComparisonEngine }            from '../../visual/VisualComparisonEngine.js';
import { InMemoryBaselineStore }             from '../../visual/BaselineStore.js';
import type { VisualAssertionParams }        from '../../visual/VisualTypes.js';
import {
  WHITE_10x10, BLACK_10x10, RED_10x10, solidPng, rectPng,
} from './_pngFixtures.js';

const STEP_ID = 'step-abc';
const NOW     = new Date().toISOString();

function makeParams(overrides: Partial<VisualAssertionParams> = {}): VisualAssertionParams {
  return {
    assertion_kind: 'assert_visual_match',
    baseline_id:    'test-baseline',
    mode:           'exact',
    tolerance:      0,
    threshold:      0,
    ...overrides,
  };
}

describe('VisualComparisonEngine — capture_baseline', () => {
  it('returns PASS and stores baseline when capture_baseline=true', async () => {
    const store  = new InMemoryBaselineStore();
    const engine = new VisualComparisonEngine(store);
    const result = await engine.evaluate(
      WHITE_10x10(), makeParams({ capture_baseline: true }), STEP_ID, NOW,
    );
    expect(result.status).toBe('PASS');
    expect(await store.exists('test-baseline')).toBe(true);
    expect(result.evidenceCurrent).toBeDefined();
  });

  it('capture_baseline message describes dimensions', async () => {
    const store  = new InMemoryBaselineStore();
    const engine = new VisualComparisonEngine(store);
    const result = await engine.evaluate(
      WHITE_10x10(), makeParams({ capture_baseline: true }), STEP_ID, NOW,
    );
    expect(result.message).toMatch(/10.+10/);
  });
});

describe('VisualComparisonEngine — no baseline', () => {
  it('returns ERROR when no baseline exists', async () => {
    const store  = new InMemoryBaselineStore();
    const engine = new VisualComparisonEngine(store);
    const result = await engine.evaluate(WHITE_10x10(), makeParams(), STEP_ID, NOW);
    expect(result.status).toBe('ERROR');
    expect(result.message).toMatch(/no baseline/i);
  });
});

describe('VisualComparisonEngine — exact match', () => {
  let store:  InMemoryBaselineStore;
  let engine: VisualComparisonEngine;

  beforeEach(async () => {
    store  = new InMemoryBaselineStore();
    engine = new VisualComparisonEngine(store);
    await store.save('test-baseline', WHITE_10x10());
  });

  it('identical images → PASS', async () => {
    const result = await engine.evaluate(WHITE_10x10(), makeParams(), STEP_ID, NOW);
    expect(result.status).toBe('PASS');
  });

  it('different images → FAIL', async () => {
    const result = await engine.evaluate(BLACK_10x10(), makeParams(), STEP_ID, NOW);
    expect(result.status).toBe('FAIL');
  });

  it('FAIL result includes diffPercent in actual', () => {
    return engine.evaluate(BLACK_10x10(), makeParams(), STEP_ID, NOW).then(r => {
      expect(r.actual).toMatch(/%/);
    });
  });

  it('FAIL result has all four evidence images', async () => {
    const result = await engine.evaluate(BLACK_10x10(), makeParams(), STEP_ID, NOW) as import('../../visual/VisualTypes.js').VisualAssertionResult;
    expect(result.evidenceBaseline).toBeDefined();
    expect(result.evidenceCurrent).toBeDefined();
    expect(result.evidenceDiff).toBeDefined();
    expect(result.evidenceOverlay).toBeDefined();
  });

  it('PASS result also has all four evidence images', async () => {
    const result = await engine.evaluate(WHITE_10x10(), makeParams(), STEP_ID, NOW) as import('../../visual/VisualTypes.js').VisualAssertionResult;
    expect(result.evidenceBaseline).toBeDefined();
    expect(result.evidenceCurrent).toBeDefined();
    expect(result.evidenceDiff).toBeDefined();
    expect(result.evidenceOverlay).toBeDefined();
  });

  it('result.visual contains metrics', async () => {
    const result = await engine.evaluate(WHITE_10x10(), makeParams(), STEP_ID, NOW) as import('../../visual/VisualTypes.js').VisualAssertionResult;
    expect(result.visual).toBeDefined();
    expect(result.visual!.totalPixels).toBe(100);
    expect(result.visual!.diffPixels).toBe(0);
  });

  it('baselineKey reflects params.baseline_id', async () => {
    const result = await engine.evaluate(WHITE_10x10(), makeParams(), STEP_ID, NOW) as import('../../visual/VisualTypes.js').VisualAssertionResult;
    expect(result.baselineKey).toBe('test-baseline');
  });
});

describe('VisualComparisonEngine — percentage_difference mode', () => {
  it('diff within threshold passes', async () => {
    const store  = new InMemoryBaselineStore();
    const engine = new VisualComparisonEngine(store);
    // 1 pixel out of 100 differs
    await store.save('b', WHITE_10x10());
    const result = await engine.evaluate(
      rectPng(10, 10, 0, 0, 1, 1, 0, 0, 0),
      makeParams({ baseline_id: 'b', mode: 'percentage_difference', threshold: 5 }),
      STEP_ID, NOW,
    );
    expect(result.status).toBe('PASS');
  });

  it('diff above threshold fails', async () => {
    const store  = new InMemoryBaselineStore();
    const engine = new VisualComparisonEngine(store);
    await store.save('b', WHITE_10x10());
    const result = await engine.evaluate(
      RED_10x10(),
      makeParams({ baseline_id: 'b', mode: 'percentage_difference', threshold: 5 }),
      STEP_ID, NOW,
    );
    expect(result.status).toBe('FAIL');
  });
});

describe('VisualComparisonEngine — ignore_regions mode', () => {
  it('ignores differences in specified region', async () => {
    const store  = new InMemoryBaselineStore();
    const engine = new VisualComparisonEngine(store);
    await store.save('b', WHITE_10x10());
    const result = await engine.evaluate(
      rectPng(10, 10, 0, 0, 5, 5, 255, 0, 0),  // top-left 5×5 differs
      makeParams({
        baseline_id:    'b',
        mode:           'ignore_regions',
        ignore_regions: [{ x: 0, y: 0, width: 5, height: 5 }],
      }),
      STEP_ID, NOW,
    );
    expect(result.status).toBe('PASS');
  });
});

describe('VisualComparisonEngine — resolution_normalization mode', () => {
  it('resizes current and passes when content is the same colour', async () => {
    const store  = new InMemoryBaselineStore();
    const engine = new VisualComparisonEngine(store);
    await store.save('b', WHITE_10x10());
    const result = await engine.evaluate(
      solidPng(20, 10, 255, 255, 255),  // same colour, different size
      makeParams({ baseline_id: 'b', mode: 'resolution_normalization' }),
      STEP_ID, NOW,
    );
    expect(result.status).toBe('PASS');
    const vr = result as import('../../visual/VisualTypes.js').VisualAssertionResult;
    expect(vr.visual?.resized).toBe(true);
  });
});

describe('VisualComparisonEngine — baseline_id defaults to stepId', () => {
  it('uses stepId as key when baseline_id is not set', async () => {
    const store  = new InMemoryBaselineStore();
    const engine = new VisualComparisonEngine(store);
    await engine.evaluate(
      WHITE_10x10(),
      { assertion_kind: 'assert_visual_match', capture_baseline: true },
      'my-step',
      NOW,
    );
    expect(await store.exists('my-step')).toBe(true);
  });
});
