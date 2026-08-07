// ─── VisualMatchAssertionHandler Tests ────────────────────────────────────────

import { describe, it, expect, beforeEach } from '@jest/globals';
import { VisualMatchAssertionHandler }       from '../../visual/handlers/VisualMatchAssertionHandler.js';
import { InMemoryBaselineStore }             from '../../visual/BaselineStore.js';
import type { IDriver }                      from '../../drivers/IDriver.js';
import { WHITE_10x10, BLACK_10x10 }          from './_pngFixtures.js';

// ─── Mock driver factory ──────────────────────────────────────────────────────

function makeDriver(screenshotBuf?: Buffer): IDriver {
  return {
    manifest: {
      driverId:     'test',
      displayName:  'Test Driver',
      supportedOS:  [],
      capabilities: new Set(['screenshot']),
    },
    connect:    async () => {},
    disconnect: async () => {},
    execute:    async (_req) => ({
      success:      true,
      duration_ms:  10,
      screenshot:   screenshotBuf,
      raw:          { screenshot: screenshotBuf },
    }),
  } as unknown as IDriver;
}

function makeNoScreenshotDriver(): IDriver {
  return {
    manifest: {
      driverId:     'test-no-ss',
      displayName:  'No Screenshot Driver',
      supportedOS:  [],
      capabilities: new Set<string>(),
    },
    connect:    async () => {},
    disconnect: async () => {},
    execute:    async () => ({
      success: true,
      duration_ms: 10,
    }),
  } as unknown as IDriver;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VisualMatchAssertionHandler', () => {
  let store:   InMemoryBaselineStore;
  let handler: VisualMatchAssertionHandler;

  beforeEach(() => {
    store   = new InMemoryBaselineStore();
    handler = new VisualMatchAssertionHandler(store);
  });

  it('kind is assert_visual_match', () => {
    expect(handler.kind).toBe('assert_visual_match');
  });

  it('returns ERROR when driver returns no screenshot', async () => {
    const result = await handler.evaluate(
      { assertion_kind: 'assert_visual_match' },
      makeNoScreenshotDriver(),
      'step-1',
    );
    expect(result.status).toBe('ERROR');
    expect(result.message).toMatch(/screenshot/i);
  });

  it('returns PASS when capture_baseline=true and screenshot is valid', async () => {
    const result = await handler.evaluate(
      { assertion_kind: 'assert_visual_match', capture_baseline: true },
      makeDriver(WHITE_10x10()),
      'step-1',
    );
    expect(result.status).toBe('PASS');
    expect(await store.exists('step-1')).toBe(true);
  });

  it('returns ERROR when no baseline exists and not capturing', async () => {
    const result = await handler.evaluate(
      { assertion_kind: 'assert_visual_match' },
      makeDriver(WHITE_10x10()),
      'step-1',
    );
    expect(result.status).toBe('ERROR');
    expect(result.message).toMatch(/no baseline/i);
  });

  it('returns PASS when current matches baseline', async () => {
    await store.save('step-1', WHITE_10x10());
    const result = await handler.evaluate(
      { assertion_kind: 'assert_visual_match' },
      makeDriver(WHITE_10x10()),
      'step-1',
    );
    expect(result.status).toBe('PASS');
  });

  it('returns FAIL when current differs from baseline', async () => {
    await store.save('step-1', WHITE_10x10());
    const result = await handler.evaluate(
      { assertion_kind: 'assert_visual_match' },
      makeDriver(BLACK_10x10()),
      'step-1',
    );
    expect(result.status).toBe('FAIL');
  });

  it('uses baseline_id from params as the store key', async () => {
    const result = await handler.evaluate(
      { assertion_kind: 'assert_visual_match', baseline_id: 'my-key', capture_baseline: true },
      makeDriver(WHITE_10x10()),
      'step-99',
    );
    expect(result.status).toBe('PASS');
    expect(await store.exists('my-key')).toBe(true);
    expect(await store.exists('step-99')).toBe(false);
  });

  it('replaces baseline when capture_baseline=true called again', async () => {
    await store.save('step-1', WHITE_10x10());
    // Capture new baseline with black image
    await handler.evaluate(
      { assertion_kind: 'assert_visual_match', capture_baseline: true },
      makeDriver(BLACK_10x10()),
      'step-1',
    );
    // Now compare white — should fail (new baseline is black)
    const result = await handler.evaluate(
      { assertion_kind: 'assert_visual_match' },
      makeDriver(WHITE_10x10()),
      'step-1',
    );
    expect(result.status).toBe('FAIL');
  });
});

// ─── AssertionRegistry integration ───────────────────────────────────────────

describe('AssertionRegistry includes assert_visual_match', () => {
  it('registry has the visual handler registered', async () => {
    const { AssertionRegistry } = await import('../../assertions/AssertionRegistry.js');
    const reg = new AssertionRegistry();
    expect(reg.has('assert_visual_match')).toBe(true);
    expect(reg.list()).toContain('assert_visual_match');
  });

  it('registry now has 14 handlers (13 M4 + 1 M5)', async () => {
    const { AssertionRegistry } = await import('../../assertions/AssertionRegistry.js');
    const reg = new AssertionRegistry();
    expect(reg.list().length).toBe(14);
  });
});
