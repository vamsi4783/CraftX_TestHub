// ─── Healing strategy unit tests (Phase 4 M7) ────────────────────────────────
import { describe, it, expect } from '@jest/globals';

import { ElementIdChangedStrategy }           from '../../healing/strategies/ElementIdChangedStrategy.js';
import { ButtonTextChangedStrategy }          from '../../healing/strategies/ButtonTextChangedStrategy.js';
import { RelativePositionShiftStrategy }      from '../../healing/strategies/RelativePositionShiftStrategy.js';
import { XPathFallbackStrategy }              from '../../healing/strategies/XPathFallbackStrategy.js';
import { CssSelectorFallbackStrategy }        from '../../healing/strategies/CssSelectorFallbackStrategy.js';
import { AccessibilityLabelFallbackStrategy } from '../../healing/strategies/AccessibilityLabelFallbackStrategy.js';
import { NearbyElementSimilarityStrategy }    from '../../healing/strategies/NearbyElementSimilarityStrategy.js';
import { RetryWithWaitStrategy }              from '../../healing/strategies/RetryWithWaitStrategy.js';
import { ScrollThenRetryStrategy }            from '../../healing/strategies/ScrollThenRetryStrategy.js';
import { VisibilityRetryStrategy }            from '../../healing/strategies/VisibilityRetryStrategy.js';

const NOOP_DRIVER: any = {
  execute: async () => ({ success: false, duration_ms: 0 }),
};

function makeStep(selector: string, action = 'tap', driverId = 'android'): any {
  return {
    stepId:     'step-1',
    stepNumber: 1,
    action:     { action, selector, driver_id: driverId, params: {} },
  };
}

// ─── ElementIdChangedStrategy ─────────────────────────────────────────────────
describe('ElementIdChangedStrategy', () => {
  const strategy = new ElementIdChangedStrategy();

  it('has correct kind', () => { expect(strategy.kind).toBe('element_id_changed'); });
  it('canHandle() resource-id with package prefix', () =>
    expect(strategy.canHandle(makeStep('com.example:id/btn_login'), '')).toBe(true));
  it('canHandle() selector with slash', () =>
    expect(strategy.canHandle(makeStep('id/foo'), '')).toBe(true));
  it('canHandle() returns false for plain text selector', () =>
    expect(strategy.canHandle(makeStep('Login'), '')).toBe(false));

  it('getCandidates() returns candidates for resource-id selector', async () => {
    const cands = await strategy.getCandidates(makeStep('com.example:id/btn_login'), NOOP_DRIVER, '');
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.some(c => c.locator.value.includes('btn_login'))).toBe(true);
  });

  it('getCandidates() strips package prefix', async () => {
    const cands = await strategy.getCandidates(makeStep('com.app:id/login_button'), NOOP_DRIVER, '');
    expect(cands.some(c => c.locator.value === 'login_button')).toBe(true);
  });

  it('getCandidates() all candidates have confidence > 0', async () => {
    const cands = await strategy.getCandidates(makeStep('com.example:id/btn_ok'), NOOP_DRIVER, '');
    expect(cands.every(c => c.confidence > 0)).toBe(true);
  });
});

// ─── ButtonTextChangedStrategy ────────────────────────────────────────────────
describe('ButtonTextChangedStrategy', () => {
  const strategy = new ButtonTextChangedStrategy();

  it('has correct kind', () => { expect(strategy.kind).toBe('button_text_changed'); });
  it('canHandle() plain text selector', () =>
    expect(strategy.canHandle(makeStep('Login'), '')).toBe(true));
  it('canHandle() returns false for xpath selector', () =>
    expect(strategy.canHandle(makeStep('//android.widget.Button'), '')).toBe(false));

  it('getCandidates() includes case variants', async () => {
    const cands = await strategy.getCandidates(makeStep('Login'), NOOP_DRIVER, '');
    const values = cands.map(c => c.locator.value);
    expect(values).toContain('LOGIN');
    expect(values).toContain('login');
  });

  it('getCandidates() includes synonyms for "login"', async () => {
    const cands = await strategy.getCandidates(makeStep('login'), NOOP_DRIVER, '');
    const values = cands.map(c => c.locator.value);
    expect(values.some(v => /sign.in|log.in/i.test(v))).toBe(true);
  });

  it('getCandidates() all candidates have strategy = button_text_changed', async () => {
    const cands = await strategy.getCandidates(makeStep('Submit'), NOOP_DRIVER, '');
    expect(cands.every(c => c.strategy === 'button_text_changed')).toBe(true);
  });
});

// ─── RelativePositionShiftStrategy ───────────────────────────────────────────
describe('RelativePositionShiftStrategy', () => {
  const strategy = new RelativePositionShiftStrategy();

  it('has correct kind', () => { expect(strategy.kind).toBe('relative_position_shift'); });
  it('canHandle() positional xpath', () =>
    expect(strategy.canHandle(makeStep('//android.widget.Button[2]'), '')).toBe(true));
  it('canHandle() returns false for non-positional xpath', () =>
    expect(strategy.canHandle(makeStep('//android.widget.Button[@resource-id="x"]'), '')).toBe(false));

  it('getCandidates() produces adjacent index variants', async () => {
    const cands = await strategy.getCandidates(makeStep('//android.widget.Button[2]'), NOOP_DRIVER, '');
    const values = cands.map(c => c.locator.value);
    expect(values.some(v => v.includes('[1]'))).toBe(true);
    expect(values.some(v => v.includes('[3]'))).toBe(true);
  });

  it('getCandidates() includes version without index predicate', async () => {
    const cands = await strategy.getCandidates(makeStep('//android.widget.Button[2]'), NOOP_DRIVER, '');
    expect(cands.some(c => !c.locator.value.includes('['))).toBe(true);
  });
});

// ─── XPathFallbackStrategy ────────────────────────────────────────────────────
describe('XPathFallbackStrategy', () => {
  const strategy = new XPathFallbackStrategy();

  it('has correct kind', () => { expect(strategy.kind).toBe('xpath_fallback'); });
  it('canHandle() non-xpath selector', () =>
    expect(strategy.canHandle(makeStep('com.example:id/btn_login'), '')).toBe(true));
  it('canHandle() returns false when selector already xpath', () =>
    expect(strategy.canHandle(makeStep('//android.widget.Button'), '')).toBe(false));

  it('getCandidates() produces XPath from resource-id', async () => {
    const cands = await strategy.getCandidates(makeStep('com.example:id/btn_login'), NOOP_DRIVER, '');
    expect(cands.some(c => c.locator.strategy === 'xpath')).toBe(true);
    expect(cands.some(c => c.locator.value.includes('@resource-id'))).toBe(true);
  });

  it('getCandidates() produces XPath from CSS id (#)', async () => {
    const cands = await strategy.getCandidates(makeStep('#loginBtn'), NOOP_DRIVER, '');
    expect(cands.some(c => c.locator.value.includes('@id="loginBtn"'))).toBe(true);
  });

  it('getCandidates() produces XPath from CSS class (.)', async () => {
    const cands = await strategy.getCandidates(makeStep('.login-btn'), NOOP_DRIVER, '');
    expect(cands.some(c => c.locator.value.includes('@class'))).toBe(true);
  });

  it('getCandidates() highest confidence candidate is > 0.5', async () => {
    const cands = await strategy.getCandidates(makeStep('com.example:id/btn'), NOOP_DRIVER, '');
    expect(cands[0].confidence).toBeGreaterThan(0.5);
  });
});

// ─── CssSelectorFallbackStrategy ─────────────────────────────────────────────
describe('CssSelectorFallbackStrategy', () => {
  const strategy = new CssSelectorFallbackStrategy();

  it('has correct kind', () => { expect(strategy.kind).toBe('css_selector_fallback'); });
  it('canHandle() web driver with any selector', () =>
    expect(strategy.canHandle(makeStep('#foo', 'click', 'chrome'), '')).toBe(true));
  it('canHandle() returns false for android driver', () =>
    expect(strategy.canHandle(makeStep('com.example:id/btn', 'tap', 'android'), '')).toBe(false));

  it('getCandidates() derives CSS from XPath @id', async () => {
    const cands = await strategy.getCandidates(makeStep('//*[@id="loginBtn"]', 'click', 'chrome'), NOOP_DRIVER, '');
    expect(cands.some(c => c.locator.value === '#loginBtn')).toBe(true);
  });

  it('getCandidates() produces data-testid selector', async () => {
    const cands = await strategy.getCandidates(makeStep('com.example:id/btn_login', 'click', 'chrome-web'), NOOP_DRIVER, '');
    expect(cands.some(c => c.locator.value.includes('data-testid'))).toBe(true);
  });
});

// ─── AccessibilityLabelFallbackStrategy ──────────────────────────────────────
describe('AccessibilityLabelFallbackStrategy', () => {
  const strategy = new AccessibilityLabelFallbackStrategy();

  it('has correct kind', () => { expect(strategy.kind).toBe('accessibility_label_fallback'); });
  it('canHandle() when selector has no content-desc reference', () =>
    expect(strategy.canHandle(makeStep('com.example:id/btn_login'), '')).toBe(true));
  it('canHandle() returns false when selector already has @content-desc', () =>
    expect(strategy.canHandle(makeStep('//*[@content-desc="Login"]'), '')).toBe(false));

  it('getCandidates() derives human-readable label from resource-id', async () => {
    const cands = await strategy.getCandidates(makeStep('com.example:id/btn_login'), NOOP_DRIVER, '');
    const values = cands.map(c => c.locator.value);
    expect(values.some(v => /btn login|btn_login/i.test(v))).toBe(true);
  });

  it('getCandidates() includes accessibility-id strategy', async () => {
    const cands = await strategy.getCandidates(makeStep('com.example:id/sign_in_btn'), NOOP_DRIVER, '');
    expect(cands.some(c => c.locator.strategy === 'accessibility-id')).toBe(true);
  });
});

// ─── NearbyElementSimilarityStrategy ─────────────────────────────────────────
describe('NearbyElementSimilarityStrategy', () => {
  const strategy = new NearbyElementSimilarityStrategy();

  it('has correct kind', () => { expect(strategy.kind).toBe('nearby_element_similarity'); });
  it('canHandle() xpath with element type', () =>
    expect(strategy.canHandle(makeStep('//android.widget.Button[@resource-id="x"]'), '')).toBe(true));
  it('canHandle() returns false for non-xpath', () =>
    expect(strategy.canHandle(makeStep('btn_login'), '')).toBe(false));

  it('getCandidates() includes class-name for full qualified type', async () => {
    const cands = await strategy.getCandidates(makeStep('//android.widget.Button[@resource-id="x"]'), NOOP_DRIVER, '');
    expect(cands.some(c => c.locator.strategy === 'class-name')).toBe(true);
  });

  it('getCandidates() includes first-of-type xpath', async () => {
    const cands = await strategy.getCandidates(makeStep('//android.widget.Button[@resource-id="x"]'), NOOP_DRIVER, '');
    expect(cands.some(c => c.locator.value === '//android.widget.Button[1]')).toBe(true);
  });
});

// ─── RetryWithWaitStrategy ────────────────────────────────────────────────────
describe('RetryWithWaitStrategy', () => {
  const strategy = new RetryWithWaitStrategy(10); // 10ms for tests

  it('has correct kind', () => { expect(strategy.kind).toBe('retry_with_wait'); });
  it('canHandle() transient "not found" error', () =>
    expect(strategy.canHandle(makeStep('btn'), 'no such element')).toBe(true));
  it('canHandle() returns false for non-transient errors', () =>
    expect(strategy.canHandle(makeStep('btn'), 'permission denied')).toBe(false));

  it('getCandidates() returns original selector unchanged', async () => {
    const cands = await strategy.getCandidates(makeStep('com.example:id/btn'), NOOP_DRIVER, 'no such element');
    expect(cands.length).toBe(1);
    expect(cands[0].locator.value).toBe('com.example:id/btn');
  });

  it('getCandidates() waits and returns within reasonable time', async () => {
    const t0    = Date.now();
    await strategy.getCandidates(makeStep('x'), NOOP_DRIVER, 'not found');
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(10);
    expect(elapsed).toBeLessThan(500);
  });
});

// ─── ScrollThenRetryStrategy ──────────────────────────────────────────────────
describe('ScrollThenRetryStrategy', () => {
  const strategy = new ScrollThenRetryStrategy();

  it('has correct kind', () => { expect(strategy.kind).toBe('scroll_then_retry'); });
  it('canHandle() off-screen error', () =>
    expect(strategy.canHandle(makeStep('btn'), 'element not visible')).toBe(true));
  it('canHandle() handles "not found" errors too', () =>
    expect(strategy.canHandle(makeStep('x'), 'no such element')).toBe(true));
  it('canHandle() returns false for empty selector', () =>
    expect(strategy.canHandle(makeStep(''), 'not visible')).toBe(false));

  it('getCandidates() returns candidates even when driver scroll fails', async () => {
    const cands = await strategy.getCandidates(makeStep('btn'), NOOP_DRIVER, 'not visible');
    expect(cands.length).toBeGreaterThan(0);
  });
});

// ─── VisibilityRetryStrategy ──────────────────────────────────────────────────
describe('VisibilityRetryStrategy', () => {
  const strategy = new VisibilityRetryStrategy();

  it('has correct kind', () => { expect(strategy.kind).toBe('visibility_retry'); });
  it('canHandle() visibility errors', () =>
    expect(strategy.canHandle(makeStep('btn'), 'element not visible')).toBe(true));
  it('canHandle() hidden / display:none errors', () =>
    expect(strategy.canHandle(makeStep('x'), 'hidden')).toBe(true));
  it('canHandle() returns false for unrelated errors', () =>
    expect(strategy.canHandle(makeStep('x'), 'permission denied')).toBe(false));

  it('getCandidates() adds @displayed="true" guard to xpath', async () => {
    const cands = await strategy.getCandidates(makeStep('//android.widget.Button[@resource-id="x"]'), NOOP_DRIVER, 'not visible');
    expect(cands.some(c => c.locator.value.includes('@displayed'))).toBe(true);
  });

  it('getCandidates() adds :not([hidden]) for CSS selectors', async () => {
    const cands = await strategy.getCandidates(makeStep('#submitBtn', 'click', 'chrome'), NOOP_DRIVER, 'not visible');
    expect(cands.some(c => c.locator.value.includes(':not([hidden])'))).toBe(true);
  });
});
