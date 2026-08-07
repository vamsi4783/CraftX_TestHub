// ─── useAutonomousRunner Tests (Phase 4 M3) ──────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAutonomousRunner } from '@/features/autonomous-runner/useAutonomousRunner';
import type { TestCaseStep } from '@/types';
import type { RunnerConfig }  from '@/features/autonomous-runner/runnerTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeStep(n: number, hasAutomation = true): TestCaseStep {
  return {
    id:          `step-${n}`,
    test_case_id: 'tc-1',
    step_number:  n,
    description: `Step ${n}`,
    expected_result: '',
    automation_config: hasAutomation
      ? { action: 'tap', driver_id: 'android', params: {} }
      : null,
    created_at: '',
    updated_at: '',
  } as TestCaseStep;
}

const FAST: Partial<RunnerConfig> = { stepDelayMs: 0, retryDelayMs: 0 };

// ─── Initial state ────────────────────────────────────────────────────────────

describe('useAutonomousRunner — initial state', () => {
  it('starts in Idle state', () => {
    const { result } = renderHook(() => useAutonomousRunner());
    expect(result.current.state).toBe('Idle');
  });

  it('has empty stepProgress initially', () => {
    const { result } = renderHook(() => useAutonomousRunner());
    expect(result.current.stepProgress).toHaveLength(0);
  });

  it('has null report initially', () => {
    const { result } = renderHook(() => useAutonomousRunner());
    expect(result.current.report).toBeNull();
  });

  it('has zero elapsed time initially', () => {
    const { result } = renderHook(() => useAutonomousRunner());
    expect(result.current.elapsedMs).toBe(0);
  });
});

// ─── start ────────────────────────────────────────────────────────────────────

describe('useAutonomousRunner — start', () => {
  it('transitions from Idle to Running', () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => { result.current.start([makeStep(1)], FAST); });
    expect(result.current.state).toBe('Running');
  });

  it('filters steps without automation_config', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => {
      result.current.start([makeStep(1, true), makeStep(2, false), makeStep(3, true)], FAST);
    });
    // Only 2 automated steps should be in stepProgress
    await waitFor(() => expect(result.current.stepProgress).toHaveLength(2));
  });

  it('completes FullyAuto run with all steps passed', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => {
      result.current.start([makeStep(1), makeStep(2), makeStep(3)], { ...FAST, mode: 'FullyAuto' });
    });
    await waitFor(() => expect(result.current.state).toBe('Completed'), { timeout: 5000 });
    expect(result.current.report?.passedSteps).toBe(3);
    expect(result.current.report?.state).toBe('Completed');
  });

  it('sets report after completion', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => { result.current.start([makeStep(1)], FAST); });
    await waitFor(() => expect(result.current.report).not.toBeNull(), { timeout: 5000 });
    expect(result.current.report?.totalSteps).toBe(1);
    expect(result.current.report?.runId).toBeTruthy();
  });

  it('handles empty step list gracefully', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => { result.current.start([], FAST); });
    await waitFor(() => expect(result.current.state).toBe('Completed'), { timeout: 3000 });
    expect(result.current.report?.totalSteps).toBe(0);
  });
});

// ─── cancel ───────────────────────────────────────────────────────────────────

describe('useAutonomousRunner — cancel', () => {
  it('transitions to Cancelling on cancel()', () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => {
      result.current.start([makeStep(1), makeStep(2)], { ...FAST, stepDelayMs: 200 });
    });
    act(() => { result.current.cancel(); });
    expect(['Cancelling', 'Cancelled']).toContain(result.current.state);
  });

  it('eventually reaches Cancelled state', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => {
      result.current.start([makeStep(1), makeStep(2)], { ...FAST, stepDelayMs: 50 });
    });
    act(() => { result.current.cancel(); });
    await waitFor(() => expect(result.current.state).toBe('Cancelled'), { timeout: 5000 });
  });
});

// ─── pause / resume ───────────────────────────────────────────────────────────

describe('useAutonomousRunner — pause / resume', () => {
  it('resumes after pause', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => {
      result.current.start([makeStep(1), makeStep(2), makeStep(3)],
        { ...FAST, stepDelayMs: 100, mode: 'FullyAuto' });
    });
    act(() => { result.current.pause(); });
    // A small wait lets the pause request be observed between steps
    await new Promise(r => setTimeout(r, 50));
    act(() => { result.current.resume(); });
    await waitFor(() => expect(result.current.state).toBe('Completed'), { timeout: 5000 });
    expect(result.current.report?.passedSteps).toBe(3);
  });
});

// ─── Manual mode ─────────────────────────────────────────────────────────────

describe('useAutonomousRunner — Manual mode', () => {
  it('pauses before each step and requires confirmStep', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => {
      result.current.start([makeStep(1), makeStep(2)], { ...FAST, mode: 'Manual' });
    });

    // Confirm step 1 — wait for pause, confirm, wait for it to leave pause
    await waitFor(
      () => expect(result.current.state).toBe('PausedBeforeStep'),
      { timeout: 3000 }
    );
    act(() => { result.current.confirmStep(); });
    await waitFor(
      () => expect(result.current.state).not.toBe('PausedBeforeStep'),
      { timeout: 3000 }
    );

    // Confirm step 2
    await waitFor(
      () => expect(result.current.state).toBe('PausedBeforeStep'),
      { timeout: 3000 }
    );
    act(() => { result.current.confirmStep(); });
    await waitFor(
      () => expect(result.current.state).not.toBe('PausedBeforeStep'),
      { timeout: 3000 }
    );

    await waitFor(() => expect(result.current.state).toBe('Completed'), { timeout: 5000 });
    expect(result.current.report?.passedSteps).toBe(2);
  }, 15000);
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('useAutonomousRunner — reset', () => {
  it('returns to Idle with empty state after reset', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => { result.current.start([makeStep(1)], FAST); });
    await waitFor(() => expect(result.current.state).toBe('Completed'), { timeout: 5000 });

    act(() => { result.current.reset(); });
    expect(result.current.state).toBe('Idle');
    expect(result.current.stepProgress).toHaveLength(0);
    expect(result.current.report).toBeNull();
    expect(result.current.elapsedMs).toBe(0);
  });
});

// ─── timeline events ──────────────────────────────────────────────────────────

describe('useAutonomousRunner — timeline events', () => {
  it('emits RunStarted and RunCompleted events', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => { result.current.start([makeStep(1)], FAST); });
    await waitFor(() => expect(result.current.state).toBe('Completed'), { timeout: 5000 });

    const kinds = result.current.timelineEvents.map(e => e.kind);
    expect(kinds).toContain('RunStarted');
    expect(kinds).toContain('RunCompleted');
  });

  it('emits StepStarted and StepPassed for each step', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => { result.current.start([makeStep(1), makeStep(2)], FAST); });
    await waitFor(() => expect(result.current.state).toBe('Completed'), { timeout: 5000 });

    const kinds = result.current.timelineEvents.map(e => e.kind);
    const started = kinds.filter(k => k === 'StepStarted');
    const passed  = kinds.filter(k => k === 'StepPassed');
    expect(started).toHaveLength(2);
    expect(passed).toHaveLength(2);
  });
});

// ─── report completeness ──────────────────────────────────────────────────────

describe('useAutonomousRunner — report completeness', () => {
  it('report has mode set correctly', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => { result.current.start([makeStep(1)], { ...FAST, mode: 'SemiAuto' }); });
    await waitFor(() => expect(result.current.report).not.toBeNull(), { timeout: 5000 });
    expect(result.current.report?.mode).toBe('SemiAuto');
  });

  it('report has startedAt and completedAt', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => { result.current.start([makeStep(1)], FAST); });
    await waitFor(() => expect(result.current.report).not.toBeNull(), { timeout: 5000 });
    expect(result.current.report?.startedAt).toBeTruthy();
    expect(result.current.report?.completedAt).toBeTruthy();
  });

  it('step progress items have stepId matching input', async () => {
    const { result } = renderHook(() => useAutonomousRunner());
    act(() => { result.current.start([makeStep(1)], FAST); });
    await waitFor(() => expect(result.current.report).not.toBeNull(), { timeout: 5000 });
    expect(result.current.report?.stepProgress[0].stepId).toBe('step-1');
  });
});
