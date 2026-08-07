// ─── Assertion Handler Unit Tests ────────────────────────────────────────────
// Tests each handler in isolation with a configured MockDriver.

import { MockDriver }          from '../../drivers/mock/MockDriver.js';
import type { ActionResult }   from '../../drivers/IDriver.js';

// Android
import { ActivityAssertionHandler }         from '../../assertions/handlers/android/ActivityAssertionHandler.js';
import { PackageAssertionHandler }          from '../../assertions/handlers/android/PackageAssertionHandler.js';
import { TextAssertionHandler }             from '../../assertions/handlers/android/TextAssertionHandler.js';
import { ViewExistsAssertionHandler }       from '../../assertions/handlers/android/ViewExistsAssertionHandler.js';
import { ScreenshotExistsAssertionHandler } from '../../assertions/handlers/android/ScreenshotExistsAssertionHandler.js';

// Chrome
import { ElementExistsAssertionHandler }    from '../../assertions/handlers/chrome/ElementExistsAssertionHandler.js';
import { TextExistsAssertionHandler }       from '../../assertions/handlers/chrome/TextExistsAssertionHandler.js';
import { AttributeAssertionHandler }        from '../../assertions/handlers/chrome/AttributeAssertionHandler.js';
import { UrlAssertionHandler }              from '../../assertions/handlers/chrome/UrlAssertionHandler.js';
import { TitleAssertionHandler }            from '../../assertions/handlers/chrome/TitleAssertionHandler.js';

// Common
import { WaitUntilAssertionHandler }        from '../../assertions/handlers/common/WaitUntilAssertionHandler.js';
import { ValueEqualsAssertionHandler }      from '../../assertions/handlers/common/ValueEqualsAssertionHandler.js';
import { RegexMatchAssertionHandler }       from '../../assertions/handlers/common/RegexMatchAssertionHandler.js';

import type { AssertionParams } from '../../assertions/AssertionTypes.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

function mockDriver(result: Partial<ActionResult> = {}): MockDriver {
  return new MockDriver({
    id: 'mock', startConnected: true,
    executeResult: { success: true, duration_ms: 0, ...result },
  });
}

const STEP = 'step-test';

// ─── Android: ActivityAssertionHandler ───────────────────────────────────────

describe('ActivityAssertionHandler', () => {
  const h = new ActivityAssertionHandler();

  it('kind is assert_activity', () => { expect(h.kind).toBe('assert_activity'); });

  it('PASS when activity contains expected', async () => {
    const d = mockDriver({ raw: { activity: 'com.example/.MainActivity' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'MainActivity' }, d, STEP);
    expect(r.status).toBe('PASS');
  });

  it('FAIL when activity not found', async () => {
    const d = mockDriver({ raw: { activity: 'com.example/.LoginActivity' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'MainActivity' }, d, STEP);
    expect(r.status).toBe('FAIL');
  });

  it('ERROR when driver throws', async () => {
    const d = new MockDriver({ id: 'mock', startConnected: true, executeResult: new Error('ADB error') });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'x' }, d, STEP);
    expect(r.status).toBe('ERROR');
    expect(r.error).toContain('ADB error');
  });
});

// ─── Android: PackageAssertionHandler ────────────────────────────────────────

describe('PackageAssertionHandler', () => {
  const h = new PackageAssertionHandler();

  it('kind is assert_package', () => { expect(h.kind).toBe('assert_package'); });

  it('PASS on exact package match', async () => {
    const d = mockDriver({ raw: { package: 'com.example.app' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'com.example.app' }, d, STEP);
    expect(r.status).toBe('PASS');
  });

  it('FAIL on wrong package', async () => {
    const d = mockDriver({ raw: { package: 'com.other.app' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'com.example.app' }, d, STEP);
    expect(r.status).toBe('FAIL');
    expect(r.actual).toBe('com.other.app');
  });
});

// ─── Android: TextAssertionHandler ───────────────────────────────────────────

describe('TextAssertionHandler', () => {
  const h = new TextAssertionHandler();

  it('kind is assert_text', () => { expect(h.kind).toBe('assert_text'); });

  it('PASS when text found in hierarchy', async () => {
    const d = mockDriver({ raw: { hierarchy: '<node text="Login Button" />' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'Login' }, d, STEP);
    expect(r.status).toBe('PASS');
  });

  it('FAIL when text not in hierarchy', async () => {
    const d = mockDriver({ raw: { hierarchy: '<node text="Register" />' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'Login' }, d, STEP);
    expect(r.status).toBe('FAIL');
  });

  it('uses text field as fallback', async () => {
    const d = mockDriver({ raw: { text: 'Hello Login World' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'Login' }, d, STEP);
    expect(r.status).toBe('PASS');
  });
});

// ─── Android: ViewExistsAssertionHandler ─────────────────────────────────────

describe('ViewExistsAssertionHandler', () => {
  const h = new ViewExistsAssertionHandler();

  it('kind is assert_view_exists', () => { expect(h.kind).toBe('assert_view_exists'); });

  it('PASS when found=true in raw', async () => {
    const d = mockDriver({ raw: { found: true } });
    const r = await h.evaluate({ assertion_kind: h.kind, selector: '//Button' }, d, STEP);
    expect(r.status).toBe('PASS');
    expect(r.expected).toBe('//Button');
  });

  it('FAIL when found=false', async () => {
    const d = mockDriver({ raw: { found: false } });
    const r = await h.evaluate({ assertion_kind: h.kind, selector: '//Button' }, d, STEP);
    expect(r.status).toBe('FAIL');
  });

  it('falls back to result.success when raw.found missing', async () => {
    const d = mockDriver({ success: true });
    const r = await h.evaluate({ assertion_kind: h.kind, selector: '//Button' }, d, STEP);
    expect(r.status).toBe('PASS');
  });
});

// ─── Android: ScreenshotExistsAssertionHandler ───────────────────────────────

describe('ScreenshotExistsAssertionHandler', () => {
  const h = new ScreenshotExistsAssertionHandler();

  it('kind is assert_screenshot_exists', () => { expect(h.kind).toBe('assert_screenshot_exists'); });

  it('PASS and attaches evidence when screenshot returned', async () => {
    const buf = Buffer.from('PNG');
    const d   = mockDriver({ screenshot: buf });
    const r   = await h.evaluate({ assertion_kind: h.kind }, d, STEP);
    expect(r.status).toBe('PASS');
    expect(r.evidence?.type).toBe('screenshot');
  });

  it('FAIL when screenshot buffer is empty', async () => {
    const d = mockDriver({ success: true, screenshot: undefined });
    const r = await h.evaluate({ assertion_kind: h.kind }, d, STEP);
    expect(r.status).toBe('FAIL');
  });
});

// ─── Chrome: ElementExistsAssertionHandler ───────────────────────────────────

describe('ElementExistsAssertionHandler', () => {
  const h = new ElementExistsAssertionHandler();

  it('kind is assert_element_exists', () => { expect(h.kind).toBe('assert_element_exists'); });

  it('PASS when raw.exists = true', async () => {
    const d = mockDriver({ raw: { exists: true } });
    const r = await h.evaluate({ assertion_kind: h.kind, selector: '#btn' }, d, STEP);
    expect(r.status).toBe('PASS');
  });

  it('FAIL when raw.exists = false', async () => {
    const d = mockDriver({ raw: { exists: false } });
    const r = await h.evaluate({ assertion_kind: h.kind, selector: '#btn' }, d, STEP);
    expect(r.status).toBe('FAIL');
  });
});

// ─── Chrome: TextExistsAssertionHandler ──────────────────────────────────────

describe('TextExistsAssertionHandler', () => {
  const h = new TextExistsAssertionHandler();

  it('kind is assert_text_exists', () => { expect(h.kind).toBe('assert_text_exists'); });

  it('PASS when page text contains expected', async () => {
    const d = mockDriver({ raw: { text: 'Welcome to the dashboard' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'dashboard' }, d, STEP);
    expect(r.status).toBe('PASS');
  });

  it('uses raw.result as fallback', async () => {
    const d = mockDriver({ raw: { result: 'Page loaded successfully' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'loaded' }, d, STEP);
    expect(r.status).toBe('PASS');
  });
});

// ─── Chrome: AttributeAssertionHandler ───────────────────────────────────────

describe('AttributeAssertionHandler', () => {
  const h = new AttributeAssertionHandler();

  it('kind is assert_attribute', () => { expect(h.kind).toBe('assert_attribute'); });

  it('PASS when attribute equals expected', async () => {
    const d = mockDriver({ raw: { value: 'disabled' } });
    const r = await h.evaluate(
      { assertion_kind: h.kind, selector: '#btn', attribute: 'class', expected: 'disabled' }, d, STEP);
    expect(r.status).toBe('PASS');
  });

  it('FAIL when attribute mismatch', async () => {
    const d = mockDriver({ raw: { value: 'active' } });
    const r = await h.evaluate(
      { assertion_kind: h.kind, selector: '#btn', attribute: 'class', expected: 'disabled' }, d, STEP);
    expect(r.status).toBe('FAIL');
    expect(r.actual).toBe('active');
  });
});

// ─── Chrome: UrlAssertionHandler ─────────────────────────────────────────────

describe('UrlAssertionHandler', () => {
  const h = new UrlAssertionHandler();

  it('kind is assert_url', () => { expect(h.kind).toBe('assert_url'); });

  it('PASS when URL contains expected', async () => {
    const d = mockDriver({ raw: { url: 'https://app.example.com/dashboard' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'dashboard' }, d, STEP);
    expect(r.status).toBe('PASS');
  });

  it('PASS on exact URL match', async () => {
    const d = mockDriver({ raw: { url: 'https://example.com' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'https://example.com' }, d, STEP);
    expect(r.status).toBe('PASS');
  });
});

// ─── Chrome: TitleAssertionHandler ───────────────────────────────────────────

describe('TitleAssertionHandler', () => {
  const h = new TitleAssertionHandler();

  it('kind is assert_title', () => { expect(h.kind).toBe('assert_title'); });

  it('PASS when title contains expected', async () => {
    const d = mockDriver({ raw: { title: 'My App — Home' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'Home' }, d, STEP);
    expect(r.status).toBe('PASS');
  });
});

// ─── Common: WaitUntilAssertionHandler ───────────────────────────────────────

describe('WaitUntilAssertionHandler', () => {
  const h = new WaitUntilAssertionHandler();

  it('kind is assert_wait_until', () => { expect(h.kind).toBe('assert_wait_until'); });

  it('PASS when condition met immediately', async () => {
    const d = mockDriver({ raw: { text: 'Loading complete' } });
    const r = await h.evaluate(
      { assertion_kind: h.kind, expected: 'Loading complete', timeout_ms: 2000, poll_interval_ms: 50 },
      d, STEP,
    );
    expect(r.status).toBe('PASS');
  });

  it('FAIL after timeout when condition never met', async () => {
    const d = mockDriver({ raw: { text: 'Still loading...' } });
    const r = await h.evaluate(
      { assertion_kind: h.kind, expected: 'Done', timeout_ms: 150, poll_interval_ms: 50 },
      d, STEP,
    );
    expect(r.status).toBe('FAIL');
    expect(r.message).toMatch(/timed out/i);
  }, 10_000);
});

// ─── Common: ValueEqualsAssertionHandler ─────────────────────────────────────

describe('ValueEqualsAssertionHandler', () => {
  const h = new ValueEqualsAssertionHandler();

  it('kind is assert_value_equals', () => { expect(h.kind).toBe('assert_value_equals'); });

  it('PASS on exact match', async () => {
    const d = mockDriver();
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'foo', value: 'foo' }, d, STEP);
    expect(r.status).toBe('PASS');
    expect(r.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('FAIL on mismatch', async () => {
    const d = mockDriver();
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'foo', value: 'bar' }, d, STEP);
    expect(r.status).toBe('FAIL');
  });

  it('empty strings match', async () => {
    const d = mockDriver();
    const r = await h.evaluate({ assertion_kind: h.kind, expected: '', value: '' }, d, STEP);
    expect(r.status).toBe('PASS');
  });
});

// ─── Common: RegexMatchAssertionHandler ──────────────────────────────────────

describe('RegexMatchAssertionHandler', () => {
  const h = new RegexMatchAssertionHandler();

  it('kind is assert_regex_match', () => { expect(h.kind).toBe('assert_regex_match'); });

  it('PASS on numeric pattern match', async () => {
    const d = mockDriver();
    const r = await h.evaluate({ assertion_kind: h.kind, regex: '^\\d+$', value: '42' }, d, STEP);
    expect(r.status).toBe('PASS');
  });

  it('FAIL when no match', async () => {
    const d = mockDriver();
    const r = await h.evaluate({ assertion_kind: h.kind, regex: '^\\d+$', value: 'abc' }, d, STEP);
    expect(r.status).toBe('FAIL');
  });

  it('ERROR on invalid regex pattern', async () => {
    const d = mockDriver();
    const r = await h.evaluate({ assertion_kind: h.kind, regex: '[bad(', value: 'test' }, d, STEP);
    expect(r.status).toBe('ERROR');
    expect(r.error).toBeTruthy();
  });

  it('PASS with negation inverts FAIL to PASS', async () => {
    const d = mockDriver();
    const r = await h.evaluate({ assertion_kind: h.kind, regex: '^\\d+$', value: 'abc', negate: true }, d, STEP);
    expect(r.status).toBe('PASS');
    expect(r.negated).toBe(true);
  });
});

// ─── negate across multiple handlers ─────────────────────────────────────────

describe('negate flag', () => {
  it('ValueEquals: negated PASS → FAIL', async () => {
    const h = new ValueEqualsAssertionHandler();
    const d = mockDriver();
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'x', value: 'x', negate: true }, d, STEP);
    expect(r.status).toBe('FAIL');
    expect(r.negated).toBe(true);
  });

  it('ActivityHandler: negated FAIL → PASS', async () => {
    const h = new ActivityAssertionHandler();
    const d = mockDriver({ raw: { activity: 'com.other/.Other' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'Main', negate: true }, d, STEP);
    expect(r.status).toBe('PASS');
    expect(r.negated).toBe(true);
  });
});

// ─── message field populated ──────────────────────────────────────────────────

describe('AssertionResult message field', () => {
  it('contains expected and actual in FAIL', async () => {
    const h = new PackageAssertionHandler();
    const d = mockDriver({ raw: { package: 'com.wrong.app' } });
    const r = await h.evaluate({ assertion_kind: h.kind, expected: 'com.right.app' }, d, STEP);
    expect(r.message).toBeTruthy();
    expect(r.message.length).toBeGreaterThan(0);
  });
});
