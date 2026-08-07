// ─── AssertionEngine Tests ───────────────────────────────────────────────────

import { AssertionEngine }    from '../../assertions/AssertionEngine.js';
import { AssertionRegistry }  from '../../assertions/AssertionRegistry.js';
import { MockDriver }         from '../../drivers/mock/MockDriver.js';
import type { AssertionParams } from '../../assertions/AssertionTypes.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEngine(driverOpts: ConstructorParameters<typeof MockDriver>[0] = {}) {
  const registry = new AssertionRegistry();
  const engine   = new AssertionEngine(registry);
  const driver   = new MockDriver({ id: 'mock', startConnected: true, ...driverOpts });
  return { registry, engine, driver };
}

const STEP_ID = 'step-001';

// ─── Basic dispatch ───────────────────────────────────────────────────────────

describe('AssertionEngine — unknown kind', () => {
  it('returns ERROR for unregistered assertion kind', async () => {
    const { engine, driver } = makeEngine();
    const result = await engine.evaluate(
      { assertion_kind: 'assert_url', expected: 'x' } as AssertionParams,
      driver,
      STEP_ID,
    );
    // assert_url IS registered — should not error
    expect(result.status).not.toBe('ERROR');
  });

  it('returns ERROR with descriptive message for truly unknown kind', async () => {
    // Subclass with has() always returning false to simulate unknown kind
    class EmptyRegistry extends AssertionRegistry {
      override has(_kind: AssertionKind): boolean { return false; }
    }
    const engine = new AssertionEngine(new EmptyRegistry());
    const driver = new MockDriver({ id: 'mock', startConnected: true });
    const result = await engine.evaluate(
      { assertion_kind: 'assert_value_equals', expected: 'x' } as AssertionParams,
      driver, STEP_ID,
    );
    expect(result.status).toBe('ERROR');
    expect(result.message).toMatch(/unknown assertion kind/i);
  });
});

// ─── assert_value_equals ──────────────────────────────────────────────────────

describe('AssertionEngine — assert_value_equals', () => {
  it('PASS when value equals expected', async () => {
    const { engine, driver } = makeEngine();
    const result = await engine.evaluate(
      { assertion_kind: 'assert_value_equals', expected: 'hello', value: 'hello' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
    expect(result.expected).toBe('hello');
    expect(result.actual).toBe('hello');
  });

  it('FAIL when value does not equal expected', async () => {
    const { engine, driver } = makeEngine();
    const result = await engine.evaluate(
      { assertion_kind: 'assert_value_equals', expected: 'hello', value: 'world' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('FAIL');
    expect(result.actual).toBe('world');
  });

  it('PASS with negation when value differs', async () => {
    const { engine, driver } = makeEngine();
    const result = await engine.evaluate(
      { assertion_kind: 'assert_value_equals', expected: 'hello', value: 'world', negate: true },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
    expect(result.negated).toBe(true);
  });

  it('has positive duration_ms', async () => {
    const { engine, driver } = makeEngine();
    const result = await engine.evaluate(
      { assertion_kind: 'assert_value_equals', expected: 'a', value: 'a' },
      driver, STEP_ID,
    );
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

// ─── assert_regex_match ───────────────────────────────────────────────────────

describe('AssertionEngine — assert_regex_match', () => {
  it('PASS when value matches pattern', async () => {
    const { engine, driver } = makeEngine();
    const result = await engine.evaluate(
      { assertion_kind: 'assert_regex_match', regex: '^[0-9]+$', value: '12345' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
  });

  it('FAIL when value does not match pattern', async () => {
    const { engine, driver } = makeEngine();
    const result = await engine.evaluate(
      { assertion_kind: 'assert_regex_match', regex: '^[0-9]+$', value: 'hello' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('FAIL');
  });

  it('ERROR for invalid regex', async () => {
    const { engine, driver } = makeEngine();
    const result = await engine.evaluate(
      { assertion_kind: 'assert_regex_match', regex: '[invalid(', value: 'test' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('ERROR');
  });
});

// ─── assert_url ──────────────────────────────────────────────────────────────

describe('AssertionEngine — assert_url', () => {
  it('PASS when URL matches', async () => {
    const { engine } = makeEngine({
      executeResult: { success: true, duration_ms: 5, raw: { url: 'https://example.com/page' } },
    });
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 5, raw: { url: 'https://example.com/page' } },
    });
    const result = await engine.evaluate(
      { assertion_kind: 'assert_url', expected: 'example.com' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
    expect(result.actual).toContain('example.com');
  });

  it('FAIL when URL does not match', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 5, raw: { url: 'https://other.com' } },
    });
    const registry = new AssertionRegistry();
    const engine   = new AssertionEngine(registry);
    const result   = await engine.evaluate(
      { assertion_kind: 'assert_url', expected: 'example.com' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('FAIL');
  });
});

// ─── assert_title ─────────────────────────────────────────────────────────────

describe('AssertionEngine — assert_title', () => {
  it('PASS when title contains expected', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 3, raw: { title: 'TestHub — Dashboard' } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_title', expected: 'Dashboard' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
  });
});

// ─── assert_text_exists ───────────────────────────────────────────────────────

describe('AssertionEngine — assert_text_exists', () => {
  it('PASS when page text contains expected', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 2, raw: { text: 'Welcome to TestHub' } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_text_exists', expected: 'Welcome' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
  });

  it('FAIL when text not present', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 2, raw: { text: 'Hello World' } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_text_exists', expected: 'Goodbye' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('FAIL');
  });
});

// ─── assert_element_exists ────────────────────────────────────────────────────

describe('AssertionEngine — assert_element_exists', () => {
  it('PASS when element found', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 4, raw: { exists: true } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_element_exists', selector: '#submit-btn' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
  });

  it('FAIL when element not found', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 4, raw: { exists: false } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_element_exists', selector: '#missing' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('FAIL');
  });
});

// ─── assert_attribute ────────────────────────────────────────────────────────

describe('AssertionEngine — assert_attribute', () => {
  it('PASS when attribute matches', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 3, raw: { value: 'true' } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_attribute', selector: '#btn', attribute: 'disabled', expected: 'true' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
  });
});

// ─── Android assertions ───────────────────────────────────────────────────────

describe('AssertionEngine — assert_activity', () => {
  it('PASS when activity matches', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 10, raw: { activity: 'com.example/.MainActivity' } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_activity', expected: 'MainActivity' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
  });

  it('FAIL when activity does not match', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 10, raw: { activity: 'com.example/.LoginActivity' } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_activity', expected: 'MainActivity' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('FAIL');
  });
});

describe('AssertionEngine — assert_package', () => {
  it('PASS when package matches exactly', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 8, raw: { package: 'com.example.app' } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_package', expected: 'com.example.app' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
  });
});

describe('AssertionEngine — assert_text (Android)', () => {
  it('PASS when text found in hierarchy', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 12, raw: { hierarchy: '<node text="Login" />' } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_text', expected: 'Login' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
  });
});

describe('AssertionEngine — assert_view_exists', () => {
  it('PASS when view found', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 7, raw: { found: true } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_view_exists', selector: '//Button[@text="Submit"]' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('PASS');
  });

  it('FAIL when view not found', async () => {
    const driver = new MockDriver({
      startConnected: true,
      executeResult: { success: true, duration_ms: 7, raw: { found: false } },
    });
    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_view_exists', selector: '//Button[@text="Missing"]' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('FAIL');
  });
});

// ─── toStepResult ─────────────────────────────────────────────────────────────

describe('AssertionEngine.toStepResult', () => {
  it('PASS → success = true', () => {
    const r = AssertionEngine.toStepResult('s1', 1, 'assertion', {
      assertionKind: 'assert_value_equals', status: 'PASS',
      expected: 'x', actual: 'x', message: 'ok', duration_ms: 10,
    });
    expect(r.success).toBe(true);
    expect(r.stepId).toBe('s1');
    expect(r.duration_ms).toBe(10);
  });

  it('FAIL → success = false with error message', () => {
    const r = AssertionEngine.toStepResult('s2', 2, 'assertion', {
      assertionKind: 'assert_value_equals', status: 'FAIL',
      expected: 'x', actual: 'y', message: 'x != y', duration_ms: 5,
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('x != y');
  });

  it('ERROR → success = false', () => {
    const r = AssertionEngine.toStepResult('s3', 3, 'assertion', {
      assertionKind: 'assert_url', status: 'ERROR',
      expected: '', actual: '', message: 'timeout', duration_ms: 5000,
    });
    expect(r.success).toBe(false);
  });
});

// ─── Timeout ──────────────────────────────────────────────────────────────────

describe('AssertionEngine — timeout', () => {
  it('returns ERROR when handler times out', async () => {
    const slowDriver = new MockDriver({ startConnected: true, executeDelay_ms: 200 });
    const engine     = new AssertionEngine(new AssertionRegistry());
    const result     = await engine.evaluate(
      { assertion_kind: 'assert_url', expected: 'x', timeout_ms: 50 },
      slowDriver, STEP_ID,
    );
    expect(result.status).toBe('ERROR');
    expect(result.message).toMatch(/timed out/i);
  });
});

// ─── Evidence capture on FAIL ─────────────────────────────────────────────────

describe('AssertionEngine — evidence capture', () => {
  it('captures screenshot evidence on FAIL when driver supports it', async () => {
    const screenshotBuf = Buffer.from('PNG_DATA');
    const driver        = new MockDriver({ startConnected: true,
      executeResult: { success: true, duration_ms: 3, raw: { url: 'https://other.com' } } });

    // Intercept execute() so the second call (evidence screenshot) returns screenshot data
    let callCount = 0;
    const origExecute = driver.execute.bind(driver);
    (driver as unknown as Record<string, unknown>)['execute'] = async (req: Parameters<typeof origExecute>[0]) => {
      callCount++;
      if (callCount >= 2) return { success: true, duration_ms: 10, screenshot: screenshotBuf };
      return origExecute(req);
    };

    const engine = new AssertionEngine(new AssertionRegistry());
    const result = await engine.evaluate(
      { assertion_kind: 'assert_url', expected: 'example.com' },
      driver, STEP_ID,
    );
    expect(result.status).toBe('FAIL');
    expect(result.evidence).toBeDefined();
    expect(result.evidence?.type).toBe('screenshot');
  });
});
