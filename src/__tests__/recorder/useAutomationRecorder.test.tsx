// ─── useAutomationRecorder Tests (Phase 4 M2) ────────────────────────────────

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutomationRecorder } from '../../features/recorder/useAutomationRecorder';
import { ANDROID_ACTIONS, CHROME_ACTIONS } from '../../features/recorder/recorderTypes';

const USER_ID = 'test-user-001';

function makeHook() {
  return renderHook(() => useAutomationRecorder(USER_ID));
}

// ─── record ───────────────────────────────────────────────────────────────────

describe('useAutomationRecorder — record', () => {
  it('starts with no steps', () => {
    const { result } = makeHook();
    expect(result.current.steps).toHaveLength(0);
    expect(result.current.stepCount).toBe(0);
  });

  it('records a tap action', () => {
    const { result } = makeHook();
    let step: ReturnType<typeof result.current.record>;

    act(() => { step = result.current.record('android', 'tap', { x: 100, y: 200 }); });

    expect(result.current.steps).toHaveLength(1);
    expect(result.current.steps[0].action).toBe('tap');
    expect(result.current.steps[0].params).toEqual({ x: 100, y: 200 });
    expect(result.current.steps[0].metadata.created_by).toBe(USER_ID);
    expect(result.current.steps[0].metadata.source).toBe('recorder');
  });

  it('records all Android actions', () => {
    const { result } = makeHook();
    act(() => {
      for (const action of ANDROID_ACTIONS) {
        result.current.record('android', action);
      }
    });
    expect(result.current.stepCount).toBe(ANDROID_ACTIONS.length);
  });

  it('records all Chrome actions', () => {
    const { result } = makeHook();
    act(() => {
      for (const action of CHROME_ACTIONS) {
        result.current.record('browser', action);
      }
    });
    expect(result.current.stepCount).toBe(CHROME_ACTIONS.length);
  });

  it('throws for unsupported action on android', () => {
    const { result } = makeHook();
    expect(() => {
      act(() => result.current.record('android', 'navigate'));
    }).toThrow(/not supported/);
  });

  it('throws for unsupported action on browser', () => {
    const { result } = makeHook();
    expect(() => {
      act(() => result.current.record('browser', 'swipe'));
    }).toThrow(/not supported/);
  });

  it('assigns unique ids to each step', () => {
    const { result } = makeHook();
    act(() => {
      result.current.record('android', 'tap');
      result.current.record('android', 'tap');
    });
    const ids = result.current.steps.map(s => s.id);
    expect(new Set(ids).size).toBe(2);
  });
});

// ─── removeStep ───────────────────────────────────────────────────────────────

describe('useAutomationRecorder — removeStep', () => {
  it('removes a step by id', () => {
    const { result } = makeHook();
    let id: string;

    act(() => {
      const step = result.current.record('android', 'tap');
      id = step.id;
      result.current.record('android', 'swipe');
    });

    act(() => result.current.removeStep(id!));

    expect(result.current.stepCount).toBe(1);
    expect(result.current.steps[0].action).toBe('swipe');
  });

  it('is a no-op for unknown id', () => {
    const { result } = makeHook();
    act(() => result.current.record('android', 'tap'));
    act(() => result.current.removeStep('ghost'));
    expect(result.current.stepCount).toBe(1);
  });
});

// ─── updateParams ─────────────────────────────────────────────────────────────

describe('useAutomationRecorder — updateParams', () => {
  it('replaces params on an existing step', () => {
    const { result } = makeHook();
    let id: string;

    act(() => {
      const step = result.current.record('android', 'tap', { x: 100, y: 100 });
      id = step.id;
    });

    act(() => result.current.updateParams(id!, { x: 540, y: 960 }));

    expect(result.current.steps[0].params).toEqual({ x: 540, y: 960 });
  });
});

// ─── reorder ──────────────────────────────────────────────────────────────────

describe('useAutomationRecorder — reorder', () => {
  it('reorders steps by id sequence', () => {
    const { result } = makeHook();
    let ids: string[];

    act(() => {
      const a = result.current.record('android', 'tap');
      const b = result.current.record('android', 'swipe');
      const c = result.current.record('android', 'press_back');
      ids = [c.id, a.id, b.id];
    });

    act(() => result.current.reorder(ids!));

    expect(result.current.steps.map(s => s.action)).toEqual(['press_back', 'tap', 'swipe']);
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe('useAutomationRecorder — clear', () => {
  it('removes all steps', () => {
    const { result } = makeHook();
    act(() => {
      result.current.record('android', 'tap');
      result.current.record('android', 'swipe');
    });
    act(() => result.current.clear());
    expect(result.current.stepCount).toBe(0);
  });
});

// ─── Chrome driver ────────────────────────────────────────────────────────────

describe('useAutomationRecorder — Chrome actions', () => {
  it('records navigate + fill sequence', () => {
    const { result } = makeHook();
    act(() => {
      result.current.record('browser', 'navigate', { value: 'https://app.example.com' });
      result.current.record('browser', 'fill', { selector: '#username', value: 'admin' });
      result.current.record('browser', 'click', { selector: '#login-btn' });
    });
    expect(result.current.stepCount).toBe(3);
    expect(result.current.steps[0].driver).toBe('browser');
    expect(result.current.steps[1].params.selector).toBe('#username');
  });
});
