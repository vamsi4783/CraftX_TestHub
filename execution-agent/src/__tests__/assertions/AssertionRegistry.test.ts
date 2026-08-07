// ─── AssertionRegistry Tests ─────────────────────────────────────────────────

import { AssertionRegistry }      from '../../assertions/AssertionRegistry.js';
import type { IAssertionHandler } from '../../assertions/handlers/IAssertionHandler.js';
import type { AssertionParams, AssertionResult, AssertionKind } from '../../assertions/AssertionTypes.js';
import type { IDriver } from '../../drivers/IDriver.js';

function makeDummyHandler(kind: AssertionKind): IAssertionHandler {
  return {
    kind,
    async evaluate(_p: AssertionParams, _d: IDriver, _s: string): Promise<AssertionResult> {
      return { assertionKind: kind, status: 'PASS', expected: '', actual: '', message: 'ok', duration_ms: 0 };
    },
  };
}

describe('AssertionRegistry — built-in registration', () => {
  let registry: AssertionRegistry;
  beforeEach(() => { registry = new AssertionRegistry(); });

  it('registers all 13 built-in handlers', () => {
    expect(registry.list()).toHaveLength(13);
  });

  it('has all Android handlers', () => {
    expect(registry.has('assert_activity')).toBe(true);
    expect(registry.has('assert_package')).toBe(true);
    expect(registry.has('assert_text')).toBe(true);
    expect(registry.has('assert_view_exists')).toBe(true);
    expect(registry.has('assert_screenshot_exists')).toBe(true);
  });

  it('has all Chrome handlers', () => {
    expect(registry.has('assert_element_exists')).toBe(true);
    expect(registry.has('assert_text_exists')).toBe(true);
    expect(registry.has('assert_attribute')).toBe(true);
    expect(registry.has('assert_url')).toBe(true);
    expect(registry.has('assert_title')).toBe(true);
  });

  it('has all common handlers', () => {
    expect(registry.has('assert_wait_until')).toBe(true);
    expect(registry.has('assert_value_equals')).toBe(true);
    expect(registry.has('assert_regex_match')).toBe(true);
  });
});

describe('AssertionRegistry — resolve', () => {
  let registry: AssertionRegistry;
  beforeEach(() => { registry = new AssertionRegistry(); });

  it('resolves a known handler', () => {
    const h = registry.resolve('assert_url');
    expect(h.kind).toBe('assert_url');
  });

  it('throws for unknown kind', () => {
    expect(() => registry.resolve('assert_nonexistent' as AssertionKind)).toThrow(/no handler registered/i);
  });
});

describe('AssertionRegistry — custom registration', () => {
  it('registers a custom handler and resolves it', () => {
    const registry = new AssertionRegistry();
    const custom   = makeDummyHandler('assert_value_equals');
    registry.register(custom);
    expect(registry.resolve('assert_value_equals')).toBe(custom);
  });

  it('overwrites an existing built-in handler', () => {
    const registry = new AssertionRegistry();
    const original = registry.resolve('assert_url');
    const custom   = makeDummyHandler('assert_url');
    registry.register(custom);
    expect(registry.resolve('assert_url')).toBe(custom);
    expect(registry.resolve('assert_url')).not.toBe(original);
  });

  it('list() includes the custom kind', () => {
    const registry = new AssertionRegistry();
    const custom   = makeDummyHandler('assert_value_equals');
    registry.register(custom);
    expect(registry.list()).toContain('assert_value_equals');
  });
});
