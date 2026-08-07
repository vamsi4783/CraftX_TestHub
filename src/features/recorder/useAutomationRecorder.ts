// ─── useAutomationRecorder ────────────────────────────────────────────────────
// React hook that manages a list of RecordedStep[] in memory.
// Wraps the pure RecorderEngine logic for use inside React components.
// Nothing is auto-saved — the user must explicitly trigger a merge/save.

import { useState, useCallback, useRef } from 'react';
import {
  RECORDER_VERSION,
  SCHEMA_VERSION,
  ANDROID_ACTIONS,
  CHROME_ACTIONS,
} from './recorderTypes';
import type {
  RecordedStep,
  RecordedParams,
  RecordableDriver,
  RecordableAction,
} from './recorderTypes';

// ─── Inline validation (mirrors RecorderEngine) ───────────────────────────────

function validateAction(driver: RecordableDriver, action: string): RecordableAction {
  const valid =
    (driver === 'android' && (ANDROID_ACTIONS as readonly string[]).includes(action)) ||
    (driver === 'browser' && (CHROME_ACTIONS  as readonly string[]).includes(action));

  if (!valid) throw new Error(`Action '${action}' not supported on driver '${driver}'`);
  return action as RecordableAction;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseAutomationRecorderReturn {
  steps:       RecordedStep[];
  stepCount:   number;

  record:      (driver: RecordableDriver, action: string, params?: RecordedParams) => RecordedStep;
  removeStep:  (id: string) => void;
  updateParams:(id: string, params: RecordedParams) => void;
  reorder:     (orderedIds: string[]) => void;
  clear:       () => void;
}

export function useAutomationRecorder(userId: string): UseAutomationRecorderReturn {
  const [steps, setSteps] = useState<RecordedStep[]>([]);
  const counterRef = useRef(0);

  const record = useCallback((
    driver: RecordableDriver,
    action: string,
    params: RecordedParams = {},
  ): RecordedStep => {
    const validAction = validateAction(driver, action);

    const step: RecordedStep = {
      id:             crypto.randomUUID(),
      schema_version: SCHEMA_VERSION,
      driver,
      action:         validAction,
      params:         { ...params },
      metadata: {
        created_by:       userId,
        created_at:       new Date().toISOString(),
        recorder_version: RECORDER_VERSION,
        source:           'recorder',
      },
    };

    counterRef.current++;
    setSteps(prev => [...prev, step]);
    return step;
  }, [userId]);

  const removeStep = useCallback((id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
  }, []);

  const updateParams = useCallback((id: string, params: RecordedParams) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, params: { ...params } } : s));
  }, []);

  const reorder = useCallback((orderedIds: string[]) => {
    setSteps(prev => {
      const map = new Map(prev.map(s => [s.id, s]));
      return orderedIds.map(id => {
        const s = map.get(id);
        if (!s) throw new Error(`reorder: unknown step id '${id}'`);
        return s;
      });
    });
  }, []);

  const clear = useCallback(() => setSteps([]), []);

  return {
    steps,
    stepCount: steps.length,
    record,
    removeStep,
    updateParams,
    reorder,
    clear,
  };
}
