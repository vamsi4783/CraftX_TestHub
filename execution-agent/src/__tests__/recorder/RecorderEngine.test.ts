// ─── RecorderEngine Tests (Phase 4 M2) ───────────────────────────────────────

import { RecorderEngine }   from '../../recorder/RecorderEngine.js';
import { MockDriver }       from '../../drivers/mock/MockDriver.js';
import {
  RECORDER_VERSION,
  SCHEMA_VERSION,
  ANDROID_ACTIONS,
  CHROME_ACTIONS,
} from '../../recorder/RecorderTypes.js';
import type { RecorderConfig } from '../../recorder/RecorderTypes.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEngine(opts: Partial<RecorderConfig> = {}): RecorderEngine {
  return new RecorderEngine({
    userId:        opts.userId        ?? 'user-001',
    defaultDriver: opts.defaultDriver ?? 'android',
  });
}

// ─── Core behaviour ───────────────────────────────────────────────────────────

describe('RecorderEngine — record', () => {
  it('records a tap action and returns a RecordedStep', () => {
    const engine = makeEngine();
    const step   = engine.record('android', 'tap', { x: 540, y: 960 });

    expect(step.schema_version).toBe(SCHEMA_VERSION);
    expect(step.driver).toBe('android');
    expect(step.action).toBe('tap');
    expect(step.params).toEqual({ x: 540, y: 960 });
    expect(step.id).toBeTruthy();
  });

  it('populates metadata correctly', () => {
    const engine = makeEngine({ userId: 'tester-42' });
    const step   = engine.record('android', 'tap');

    expect(step.metadata.created_by).toBe('tester-42');
    expect(step.metadata.recorder_version).toBe(RECORDER_VERSION);
    expect(step.metadata.source).toBe('recorder');
    expect(step.metadata.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('records all supported Android actions without throwing', () => {
    const engine = makeEngine();
    for (const action of ANDROID_ACTIONS) {
      expect(() => engine.record('android', action)).not.toThrow();
    }
    expect(engine.stepCount).toBe(ANDROID_ACTIONS.length);
  });

  it('records all supported Chrome actions without throwing', () => {
    const engine = makeEngine();
    for (const action of CHROME_ACTIONS) {
      expect(() => engine.record('browser', action)).not.toThrow();
    }
    expect(engine.stepCount).toBe(CHROME_ACTIONS.length);
  });

  it('throws for an unsupported action on android', () => {
    const engine = makeEngine();
    expect(() => engine.record('android', 'navigate')).toThrow(/not supported/);
  });

  it('throws for an unsupported action on browser', () => {
    const engine = makeEngine();
    expect(() => engine.record('browser', 'swipe')).toThrow(/not supported/);
  });

  it('throws for a completely unknown action', () => {
    const engine = makeEngine();
    expect(() => engine.record('android', 'self_destruct' as never)).toThrow();
  });

  it('each recorded step gets a unique id', () => {
    const engine = makeEngine();
    const a = engine.record('android', 'tap');
    const b = engine.record('android', 'tap');
    expect(a.id).not.toBe(b.id);
  });

  it('params default to empty object when omitted', () => {
    const engine = makeEngine();
    const step = engine.record('android', 'press_back');
    expect(step.params).toEqual({});
  });
});

// ─── getSteps ─────────────────────────────────────────────────────────────────

describe('RecorderEngine — getSteps', () => {
  it('returns steps in recording order', () => {
    const engine = makeEngine();
    engine.record('android', 'tap');
    engine.record('android', 'swipe', { x: 0, y: 500, x2: 0, y2: 200 });
    engine.record('android', 'press_back');

    const steps = engine.getSteps();
    expect(steps.map(s => s.action)).toEqual(['tap', 'swipe', 'press_back']);
  });

  it('returns a copy — mutations to the returned array do not affect internal state', () => {
    const engine = makeEngine();
    engine.record('android', 'tap');
    const steps = engine.getSteps();
    steps.pop();
    expect(engine.stepCount).toBe(1);
  });

  it('starts empty', () => {
    expect(makeEngine().getSteps()).toHaveLength(0);
  });
});

// ─── removeStep ───────────────────────────────────────────────────────────────

describe('RecorderEngine — removeStep', () => {
  it('removes a step by id', () => {
    const engine = makeEngine();
    const a = engine.record('android', 'tap');
    const b = engine.record('android', 'swipe');
    engine.removeStep(a.id);
    const steps = engine.getSteps();
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe(b.id);
  });

  it('is a no-op for an unknown id', () => {
    const engine = makeEngine();
    engine.record('android', 'tap');
    engine.removeStep('does-not-exist');
    expect(engine.stepCount).toBe(1);
  });

  it('returns the updated list', () => {
    const engine = makeEngine();
    const step = engine.record('android', 'tap');
    const result = engine.removeStep(step.id);
    expect(result).toHaveLength(0);
  });
});

// ─── updateParams ─────────────────────────────────────────────────────────────

describe('RecorderEngine — updateParams', () => {
  it('updates params on an existing step', () => {
    const engine = makeEngine();
    const step = engine.record('android', 'tap', { x: 100, y: 200 });
    engine.updateParams(step.id, { x: 540, y: 960 });
    expect(engine.getSteps()[0].params).toEqual({ x: 540, y: 960 });
  });

  it('throws for an unknown step id', () => {
    const engine = makeEngine();
    expect(() => engine.updateParams('ghost-id', {})).toThrow(/not found/);
  });

  it('replaces params entirely (no merge)', () => {
    const engine = makeEngine();
    const step = engine.record('android', 'tap', { x: 100, y: 200, timeout_ms: 5000 });
    engine.updateParams(step.id, { x: 540 });
    // timeout_ms should be gone — full replacement
    expect(engine.getSteps()[0].params).toEqual({ x: 540 });
  });
});

// ─── reorder ──────────────────────────────────────────────────────────────────

describe('RecorderEngine — reorder', () => {
  it('reorders steps to match provided id sequence', () => {
    const engine = makeEngine();
    const a = engine.record('android', 'tap');
    const b = engine.record('android', 'swipe');
    const c = engine.record('android', 'press_back');

    engine.reorder([c.id, a.id, b.id]);
    expect(engine.getSteps().map(s => s.action)).toEqual(['press_back', 'tap', 'swipe']);
  });

  it('throws when id count mismatches', () => {
    const engine = makeEngine();
    const a = engine.record('android', 'tap');
    expect(() => engine.reorder([a.id, 'extra'])).toThrow(/expected 1 ids, got 2/);
  });

  it('throws when an unknown id is included', () => {
    const engine = makeEngine();
    engine.record('android', 'tap');
    expect(() => engine.reorder(['ghost-id'])).toThrow(/unknown step id/);
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe('RecorderEngine — clear', () => {
  it('removes all steps', () => {
    const engine = makeEngine();
    engine.record('android', 'tap');
    engine.record('android', 'swipe');
    engine.clear();
    expect(engine.stepCount).toBe(0);
  });
});

// ─── toJSON ───────────────────────────────────────────────────────────────────

describe('RecorderEngine — toJSON', () => {
  it('returns a JSON-serialisable snapshot', () => {
    const engine = makeEngine();
    engine.record('android', 'tap', { x: 100, y: 200 });
    const json = engine.toJSON();
    expect(() => JSON.stringify(json)).not.toThrow();
    expect(json[0].action).toBe('tap');
  });

  it('mutations to toJSON output do not affect engine state', () => {
    const engine = makeEngine();
    engine.record('android', 'tap');
    const json = engine.toJSON();
    json[0].action = 'swipe' as never;
    expect(engine.getSteps()[0].action).toBe('tap');
  });
});

// ─── MockDriver integration ───────────────────────────────────────────────────

describe('RecorderEngine — MockDriver integration', () => {
  let driver: MockDriver;
  let engine: RecorderEngine;

  beforeEach(() => {
    driver = new MockDriver({ id: 'android_mock', startConnected: true });
    engine = makeEngine({ defaultDriver: 'android' });
  });

  it('records steps derived from MockDriver execute calls', async () => {
    // Simulate: driver executes actions, recorder captures them
    await driver.execute({ action: 'tap',   params: { x: 540, y: 960 } });
    await driver.execute({ action: 'swipe', params: { x: 100, y: 800, x2: 100, y2: 200 } });

    // Recorder captures those requests
    for (const req of driver.executeHistory) {
      engine.record(
        'android',
        req.action as string,
        (req.params ?? {}) as Record<string, unknown>,
      );
    }

    const steps = engine.getSteps();
    expect(steps).toHaveLength(2);
    expect(steps[0].action).toBe('tap');
    expect(steps[1].action).toBe('swipe');
    expect(steps[0].params).toMatchObject({ x: 540, y: 960 });
  });

  it('records type_text from MockDriver with value param', async () => {
    await driver.execute({ action: 'type_text', value: 'hello@test.com' });
    engine.record('android', 'type_text', { value: driver.lastRequest!.value });

    const steps = engine.getSteps();
    expect(steps[0].params.value).toBe('hello@test.com');
  });

  it('records press_back with no params', async () => {
    await driver.execute({ action: 'press_back' });
    engine.record('android', 'press_back');

    expect(engine.stepCount).toBe(1);
    expect(engine.getSteps()[0].params).toEqual({});
  });

  it('records wait with duration', async () => {
    await driver.execute({ action: 'wait', params: { duration_ms: 2000 } });
    engine.record('android', 'wait', { duration_ms: 2000 });

    expect(engine.getSteps()[0].params.duration_ms).toBe(2000);
  });

  it('does not record actions that throw — driver error is independent', async () => {
    const errorDriver = new MockDriver({
      id: 'error_mock',
      startConnected: true,
      executeResult: new Error('ADB disconnected'),
    });

    await expect(errorDriver.execute({ action: 'tap' })).rejects.toThrow('ADB disconnected');
    // Recorder is not called — no step added
    expect(engine.stepCount).toBe(0);
  });
});

// ─── Chrome actions ───────────────────────────────────────────────────────────

describe('RecorderEngine — Chrome actions', () => {
  it('records navigate with url', () => {
    const engine = makeEngine({ defaultDriver: 'browser' });
    const step = engine.record('browser', 'navigate', { value: 'https://example.com' });
    expect(step.action).toBe('navigate');
    expect(step.params.value).toBe('https://example.com');
  });

  it('records fill with selector and value', () => {
    const engine = makeEngine({ defaultDriver: 'browser' });
    const step = engine.record('browser', 'fill', { selector: '#email', value: 'user@test.com' });
    expect(step.params.selector).toBe('#email');
    expect(step.params.value).toBe('user@test.com');
  });

  it('records scroll with direction and amount', () => {
    const engine = makeEngine({ defaultDriver: 'browser' });
    const step = engine.record('browser', 'scroll', { direction: 'down', amount: 300 });
    expect(step.params.direction).toBe('down');
    expect(step.params.amount).toBe(300);
  });

  it('rejects android-only swipe on browser driver', () => {
    const engine = makeEngine({ defaultDriver: 'browser' });
    expect(() => engine.record('browser', 'swipe')).toThrow(/not supported/);
  });
});

// ─── Multi-driver session ─────────────────────────────────────────────────────

describe('RecorderEngine — mixed driver steps', () => {
  it('allows mixing android and browser steps in one session', () => {
    const engine = makeEngine();
    engine.record('android', 'tap',       { x: 100, y: 200 });
    engine.record('browser', 'navigate',  { value: 'https://app.example.com' });
    engine.record('android', 'press_back');

    const steps = engine.getSteps();
    expect(steps.map(s => s.driver)).toEqual(['android', 'browser', 'android']);
  });
});
