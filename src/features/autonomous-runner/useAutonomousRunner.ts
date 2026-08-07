// ─── useAutonomousRunner ──────────────────────────────────────────────────────
// React hook that drives automation_config steps.
//
// Phase 5 M1: when the agent is Connected, dispatches real commands via
// agentStore and listens for execution events. When disconnected, falls back
// to the local simulation loop (useful for UI development without a running agent).

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAgentStore }                from '../agent/agentStore';
import type { TestCaseStep }            from '@/types';
import type {
  ExecutionMode,
  RunnerState,
  StepProgress,
  StepRunStatus,
  RunnerReport,
  RunnerTimelineEvent,
  RunnerConfig,
} from './runnerTypes';
import { DEFAULT_RUNNER_CONFIG } from './runnerTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function genId(): string { return crypto.randomUUID(); }
function now(): string   { return new Date().toISOString(); }

// ─── Hook return type ─────────────────────────────────────────────────────────

export interface UseAutonomousRunnerReturn {
  state:            RunnerState;
  currentStepIndex: number;
  stepProgress:     StepProgress[];
  timelineEvents:   RunnerTimelineEvent[];
  elapsedMs:        number;
  report:           RunnerReport | null;
  evidenceCount:    number;
  /** True when a real agent is connected and commands go over WebSocket. */
  isRealExecution:  boolean;

  start:       (steps: TestCaseStep[], config?: Partial<RunnerConfig>, driverId?: string) => void;
  pause:       () => void;
  resume:      () => void;
  cancel:      () => void;
  retryStep:   (stepIndex: number) => void;
  skipStep:    () => void;
  confirmStep: () => void;
  reset:       () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAutonomousRunner(): UseAutonomousRunnerReturn {
  const [state,            setState]            = useState<RunnerState>('Idle');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepProgress,     setStepProgress]     = useState<StepProgress[]>([]);
  const [timelineEvents,   setTimeline]         = useState<RunnerTimelineEvent[]>([]);
  const [elapsedMs,        setElapsedMs]        = useState(0);
  const [report,           setReport]           = useState<RunnerReport | null>(null);
  const [evidenceCount,    setEvidenceCount]    = useState(0);

  // Simulation-mode refs
  const pauseRef    = useRef(false);
  const cancelRef   = useRef(false);
  const resumeRef   = useRef(false);
  const decisionRef = useRef<'retry' | 'skip' | 'abort' | null>(null);
  const configRef   = useRef<RunnerConfig>(DEFAULT_RUNNER_CONFIG);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const t0Ref       = useRef<number>(0);

  // Real-execution refs
  const sessionIdRef  = useRef<string | null>(null);
  const driverIdRef   = useRef<string>('android_adb');
  const autoStepsRef  = useRef<TestCaseStep[]>([]);
  const progressRef   = useRef<StepProgress[]>([]);

  const agentConnected  = useAgentStore(s => s.connectionState === 'Connected');
  const agentEvents     = useAgentStore(s => s.events);
  const executeTest     = useAgentStore(s => s.executeTest);
  const cancelExecution = useAgentStore(s => s.cancelExecution);
  const pauseExecution  = useAgentStore(s => s.pauseExecution);
  const resumeExecution = useAgentStore(s => s.resumeExecution);

  // ── Real-execution event handler ───────────────────────────────────────────

  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid || !agentConnected) return;

    const latest = agentEvents[0];  // pushEvent prepends — [0] is newest
    if (!latest || latest.correlationId !== sid) return;

    const p = latest.payload as Record<string, unknown>;

    switch (latest.eventType) {
      case 'ExecutionStarted': {
        setState('Running');
        break;
      }

      case 'StepCompleted':
      case 'StepPassed': {
        const stepNum = (p['step_number'] as number) ?? 0;
        const idx = stepNum - 1;
        setCurrentStepIndex(idx);
        progressRef.current = progressRef.current.map((prog, i) =>
          i === idx
            ? { ...prog, status: 'passed' as StepRunStatus, duration_ms: (p['duration_ms'] as number) ?? 0, completedAt: now() }
            : prog
        );
        setStepProgress([...progressRef.current]);
        setTimeline(prev => [...prev, {
          id: genId(), kind: 'StepPassed',
          message: `Step ${stepNum} passed (${p['duration_ms'] ?? 0}ms)`,
          stepNumber: stepNum,
          offsetMs: Date.now() - t0Ref.current,
        }]);
        break;
      }

      case 'StepFailed': {
        const stepNum = (p['step_number'] as number) ?? 0;
        const idx = stepNum - 1;
        progressRef.current = progressRef.current.map((prog, i) =>
          i === idx
            ? { ...prog, status: 'failed' as StepRunStatus, error: String(p['failure_reason'] ?? ''), completedAt: now() }
            : prog
        );
        setStepProgress([...progressRef.current]);
        setTimeline(prev => [...prev, {
          id: genId(), kind: 'StepFailed',
          message: `Step ${stepNum} failed: ${p['failure_reason'] ?? 'unknown'}`,
          stepNumber: stepNum,
          offsetMs: Date.now() - t0Ref.current,
        }]);
        break;
      }

      case 'ExecutionCompleted': {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        const duration = Date.now() - t0Ref.current;
        setElapsedMs(duration);
        setState('Completed');
        const prog = progressRef.current;
        setReport({
          runId:         sid,
          state:         'Completed',
          mode:          configRef.current.mode,
          totalSteps:    prog.length,
          passedSteps:   prog.filter(s => s.status === 'passed').length,
          failedSteps:   prog.filter(s => s.status === 'failed').length,
          skippedSteps:  prog.filter(s => s.status === 'skipped').length,
          duration_ms:   duration,
          stepProgress:  [...prog],
          startedAt:     new Date(t0Ref.current).toISOString(),
          completedAt:   now(),
          evidenceCount: evidenceCount,
          timelineEvents: [...timelineEvents],
        });
        sessionIdRef.current = null;
        break;
      }

      case 'ExecutionFailed': {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setState('Failed');
        sessionIdRef.current = null;
        break;
      }

      case 'ExecutionCancelled': {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setState('Cancelled');
        sessionIdRef.current = null;
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentEvents]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const waitForResume = useCallback(async (): Promise<'resume' | 'cancel'> => {
    while (true) {
      if (cancelRef.current) return 'cancel';
      if (resumeRef.current)  { resumeRef.current = false; return 'resume'; }
      await delay(80);
    }
  }, []);

  const waitForDecision = useCallback(async (): Promise<'retry' | 'skip' | 'abort'> => {
    while (true) {
      if (cancelRef.current)           return 'abort';
      if (decisionRef.current !== null) {
        const d = decisionRef.current;
        decisionRef.current = null;
        return d;
      }
      await delay(80);
    }
  }, []);

  // ── Start ──────────────────────────────────────────────────────────────────

  const start = useCallback((
    steps:          TestCaseStep[],
    configOverrides: Partial<RunnerConfig> = {},
    driverId = 'android_adb',
  ) => {
    const cfg: RunnerConfig = { ...DEFAULT_RUNNER_CONFIG, ...configOverrides };
    configRef.current = cfg;
    driverIdRef.current = driverId;

    const autoSteps = steps.filter(s => s.automation_config !== null);
    autoStepsRef.current = autoSteps;

    const initialProgress: StepProgress[] = autoSteps.map(s => ({
      stepId:      s.id,
      stepNumber:  s.step_number,
      description: s.description,
      action:      s.automation_config!.action,
      driverId:    s.automation_config!.driver_id,
      status:      'pending' as StepRunStatus,
      duration_ms: 0,
      retryCount:  0,
    }));
    progressRef.current = initialProgress;

    cancelRef.current   = false;
    pauseRef.current    = false;
    resumeRef.current   = false;
    decisionRef.current = null;
    t0Ref.current       = Date.now();

    setStepProgress(initialProgress);
    setTimeline([]);
    setCurrentStepIndex(0);
    setElapsedMs(0);
    setEvidenceCount(0);
    setReport(null);
    setState('Running');

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - t0Ref.current);
    }, 250);

    // ── Real execution (agent connected) ──────────────────────────────────────
    if (agentConnected) {
      const sid = genId();
      sessionIdRef.current = sid;

      // Build the step payload the agent expects
      const stepPayload = autoSteps.map(s => ({
        id:               s.id,
        step_number:      s.step_number,
        automation_config: s.automation_config!,
      }));

      setTimeline([{
        id: genId(), kind: 'RunStarted',
        message: `Real execution started — ${autoSteps.length} step(s), driver: ${driverId}`,
        offsetMs: 0,
      }]);

      executeTest(sid, '', driverId, stepPayload);
      return;
    }

    // ── Simulation fallback ───────────────────────────────────────────────────
    sessionIdRef.current = null;

    (async () => {
      const runId     = genId();
      const startedAt = now();
      const tl: RunnerTimelineEvent[] = [];

      const pushEvent = (kind: string, message: string, stepId?: string, stepNumber?: number) => {
        const ev: RunnerTimelineEvent = {
          id: genId(), kind, message, stepId, stepNumber,
          offsetMs: Date.now() - t0Ref.current,
        };
        tl.push(ev);
        setTimeline([...tl]);
        return ev;
      };

      const updateProg = (idx: number, patch: Partial<StepProgress>) => {
        progressRef.current[idx] = { ...progressRef.current[idx], ...patch };
        setStepProgress([...progressRef.current]);
      };

      pushEvent('RunStarted', `[SIMULATION] ${autoSteps.length} step(s), mode: ${cfg.mode}`);

      let finalState: RunnerState = 'Running';
      let runError                = '';
      let cancelReason            = '';
      let evidCount               = 0;
      let i                       = 0;

      while (i < autoSteps.length) {
        const s = autoSteps[i];
        setCurrentStepIndex(i);

        if (cancelRef.current) {
          finalState   = 'Cancelled';
          cancelReason = 'Cancelled by user';
          updateProg(i, { status: 'skipped' });
          pushEvent('Cancelled', 'Run cancelled by user', s.id, s.step_number);
          break;
        }

        if (cfg.mode === 'Manual') {
          setState('PausedBeforeStep');
          pushEvent('PausedBeforeStep', `Waiting for confirmation on step ${s.step_number}`, s.id, s.step_number);
          const outcome = await waitForResume();
          if (outcome === 'cancel') {
            finalState = 'Cancelled'; cancelReason = 'Cancelled at manual pause';
            updateProg(i, { status: 'skipped' });
            pushEvent('Cancelled', 'Run cancelled during manual pause');
            break;
          }
          setState('Running');
          pushEvent('Resumed', `Resumed at step ${s.step_number}`, s.id, s.step_number);
        }

        if (pauseRef.current && cfg.mode !== 'Manual') {
          pauseRef.current = false;
          setState('PausedBeforeStep');
          pushEvent('PausedBeforeStep', `Paused before step ${s.step_number}`, s.id, s.step_number);
          const outcome = await waitForResume();
          if (outcome === 'cancel') {
            finalState = 'Cancelled'; cancelReason = 'Cancelled during pause';
            updateProg(i, { status: 'skipped' });
            pushEvent('Cancelled', 'Run cancelled during pause');
            break;
          }
          setState('Running');
          pushEvent('Resumed', `Resumed at step ${s.step_number}`, s.id, s.step_number);
        }

        updateProg(i, { status: 'running', startedAt: now() });
        pushEvent('StepStarted', `Step ${s.step_number}: ${s.automation_config!.action}`, s.id, s.step_number);

        let stepPassed = false;
        let lastError  = '';

        for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
          if (attempt > 0) {
            updateProg(i, { status: 'retrying', retryCount: attempt });
            pushEvent('StepRetrying', `Retrying step ${s.step_number} (attempt ${attempt + 1})`, s.id, s.step_number);
            await delay(cfg.retryDelayMs);
          }

          const stepDuration = cfg.stepDelayMs + Math.floor(Math.random() * 200);
          await delay(stepDuration);

          // Simulation: all steps pass
          stepPassed = true;
          evidCount++;
          updateProg(i, { status: 'passed', duration_ms: stepDuration, completedAt: now(), retryCount: attempt });
          setEvidenceCount(evidCount);
          pushEvent('StepPassed', `Step ${s.step_number} passed (${stepDuration}ms)`, s.id, s.step_number);
          break;
        }

        if (!stepPassed) {
          updateProg(i, { status: 'failed', error: lastError, completedAt: now() });
          pushEvent('StepFailed', `Step ${s.step_number} failed: ${lastError}`, s.id, s.step_number);

          if (cfg.mode === 'SemiAuto') {
            setState('PausedOnFailure');
            pushEvent('PausedOnFailure', `Paused — step ${s.step_number} failed, awaiting decision`, s.id, s.step_number);
            const decision = await waitForDecision();
            if (decision === 'abort') { finalState = 'Cancelled'; cancelReason = 'Aborted on failure'; pushEvent('Cancelled', 'Run aborted by user after failure'); break; }
            if (decision === 'skip') { updateProg(i, { status: 'skipped' }); pushEvent('StepSkipped', `Step ${s.step_number} skipped by user`, s.id, s.step_number); setState('Running'); i++; continue; }
            if (decision === 'retry') { setState('Running'); continue; }
          }

          if (cfg.stopOnFailure) { finalState = 'Failed'; runError = lastError; pushEvent('RunFailed', `Run stopped on step ${s.step_number} failure`); break; }
        }

        i++;
      }

      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      const duration_ms = Date.now() - t0Ref.current;
      setElapsedMs(duration_ms);

      if (finalState === 'Running') {
        finalState = 'Completed';
        pushEvent('RunCompleted', `[SIMULATION] ${progressRef.current.filter(p => p.status === 'passed').length}/${autoSteps.length} passed`);
      }

      setState(finalState);
      setReport({
        runId, state: finalState, mode: cfg.mode,
        totalSteps:   autoSteps.length,
        passedSteps:  progressRef.current.filter(p => p.status === 'passed').length,
        failedSteps:  progressRef.current.filter(p => p.status === 'failed').length,
        skippedSteps: progressRef.current.filter(p => p.status === 'skipped').length,
        duration_ms, stepProgress: [...progressRef.current],
        startedAt, completedAt: now(),
        error: runError || undefined, cancelReason: cancelReason || undefined,
        evidenceCount: evidCount, timelineEvents: [...tl],
      });
    })();
  }, [agentConnected, executeTest, waitForResume, waitForDecision]);

  // ── Controls ───────────────────────────────────────────────────────────────

  const pause = useCallback(() => {
    if (agentConnected && sessionIdRef.current) {
      pauseExecution(sessionIdRef.current);
    } else {
      pauseRef.current = true;
    }
  }, [agentConnected, pauseExecution]);

  const resume = useCallback(() => {
    if (agentConnected && sessionIdRef.current) {
      resumeExecution(sessionIdRef.current);
    } else {
      resumeRef.current = true;
    }
  }, [agentConnected, resumeExecution]);

  const cancel = useCallback(() => {
    if (agentConnected && sessionIdRef.current) {
      cancelExecution(sessionIdRef.current);
    }
    cancelRef.current   = true;
    resumeRef.current   = true;
    decisionRef.current = 'abort';
    setState('Cancelling');
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [agentConnected, cancelExecution]);

  const confirmStep = useCallback(() => { resumeRef.current = true; }, []);
  const retryStep   = useCallback((_stepIndex: number) => { decisionRef.current = 'retry'; }, []);
  const skipStep    = useCallback(() => { decisionRef.current = 'skip'; }, []);

  const reset = useCallback(() => {
    sessionIdRef.current = null;
    cancelRef.current    = false;
    pauseRef.current     = false;
    resumeRef.current    = false;
    decisionRef.current  = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setState('Idle');
    setStepProgress([]);
    setTimeline([]);
    setCurrentStepIndex(0);
    setElapsedMs(0);
    setReport(null);
    setEvidenceCount(0);
  }, []);

  return {
    state, currentStepIndex, stepProgress, timelineEvents,
    elapsedMs, report, evidenceCount,
    isRealExecution: agentConnected,
    start, pause, resume, cancel, retryStep, skipStep, confirmStep, reset,
  };
}
