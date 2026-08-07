// ─── useAutonomousRunner ──────────────────────────────────────────────────────
// React hook that runs automation_config steps through a simulation loop.
// When the real agent is connected, this dispatches via agentStore instead.
// Simulation mode: mimics the AutonomousRunnerEngine's behaviour locally.

import { useState, useCallback, useRef } from 'react';
import type { TestCaseStep }     from '@/types';
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

// ─── Internal simulation helpers ──────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function genId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

// ─── Hook return type ─────────────────────────────────────────────────────────

export interface UseAutonomousRunnerReturn {
  state:            RunnerState;
  currentStepIndex: number;
  stepProgress:     StepProgress[];
  timelineEvents:   RunnerTimelineEvent[];
  elapsedMs:        number;
  report:           RunnerReport | null;
  evidenceCount:    number;

  start:     (steps: TestCaseStep[], config?: Partial<RunnerConfig>) => void;
  pause:     () => void;
  resume:    () => void;
  cancel:    () => void;
  retryStep: (stepIndex: number) => void;
  skipStep:  () => void;
  confirmStep: () => void;   // Manual mode: advance to next step
  reset:     () => void;
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

  // Mutable refs for inter-async communication
  const pauseRef    = useRef(false);
  const cancelRef   = useRef(false);
  const resumeRef   = useRef(false);     // set to true to unblock a pause
  const decisionRef = useRef<'retry' | 'skip' | 'abort' | null>(null);
  const configRef   = useRef<RunnerConfig>(DEFAULT_RUNNER_CONFIG);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const t0Ref       = useRef<number>(0);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const addEvent = useCallback((
    kind: string,
    message: string,
    stepId?: string,
    stepNumber?: number,
  ) => {
    const ev: RunnerTimelineEvent = {
      id: genId(), kind, message, stepId, stepNumber,
      offsetMs: Date.now() - t0Ref.current,
    };
    setTimeline(prev => [...prev, ev]);
    return ev;
  }, []);

  const updateStep = useCallback((index: number, patch: Partial<StepProgress>) => {
    setStepProgress(prev => prev.map((p, i) => i === index ? { ...p, ...patch } : p));
  }, []);

  // Poll until resumeRef is true, or cancel
  const waitForResume = useCallback(async (): Promise<'resume' | 'cancel'> => {
    while (true) {
      if (cancelRef.current) return 'cancel';
      if (resumeRef.current)  { resumeRef.current = false; return 'resume'; }
      await delay(80);
    }
  }, []);

  // Poll for SemiAuto failure decision
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

  // ── Main simulation loop ───────────────────────────────────────────────────

  const start = useCallback((
    steps: TestCaseStep[],
    configOverrides: Partial<RunnerConfig> = {},
  ) => {
    const cfg: RunnerConfig = { ...DEFAULT_RUNNER_CONFIG, ...configOverrides };
    configRef.current = cfg;

    // Filter steps that have automation_config
    const autoSteps = steps.filter(s => s.automation_config !== null);

    // Initial progress
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

    // Reset all state
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

    // Elapsed timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - t0Ref.current);
    }, 250);

    // Run the simulation loop asynchronously
    (async () => {
      const runId    = genId();
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
        initialProgress[idx] = { ...initialProgress[idx], ...patch };
        setStepProgress([...initialProgress]);
      };

      pushEvent('RunStarted', `Run started — ${autoSteps.length} step(s), mode: ${cfg.mode}`);

      let finalState: RunnerState = 'Running';
      let runError                = '';
      let cancelReason            = '';
      let evidCount               = 0;
      let i                       = 0;

      while (i < autoSteps.length) {
        const s    = autoSteps[i];
        const prog = initialProgress[i];

        setCurrentStepIndex(i);

        // Cancellation check
        if (cancelRef.current) {
          finalState   = 'Cancelled';
          cancelReason = 'Cancelled by user';
          updateProg(i, { status: 'skipped' });
          pushEvent('Cancelled', 'Run cancelled by user', s.id, s.step_number);
          break;
        }

        // Manual: pause before every step
        if (cfg.mode === 'Manual') {
          setState('PausedBeforeStep');
          pushEvent('PausedBeforeStep',
            `Waiting for confirmation on step ${s.step_number}`, s.id, s.step_number);
          const outcome = await waitForResume();
          if (outcome === 'cancel') {
            finalState   = 'Cancelled';
            cancelReason = 'Cancelled at manual pause';
            updateProg(i, { status: 'skipped' });
            pushEvent('Cancelled', 'Run cancelled during manual pause');
            break;
          }
          setState('Running');
          pushEvent('Resumed', `Resumed at step ${s.step_number}`, s.id, s.step_number);
        }

        // User-triggered pause (SemiAuto / FullyAuto)
        if (pauseRef.current && cfg.mode !== 'Manual') {
          pauseRef.current = false;
          setState('PausedBeforeStep');
          pushEvent('PausedBeforeStep',
            `Paused before step ${s.step_number}`, s.id, s.step_number);
          const outcome = await waitForResume();
          if (outcome === 'cancel') {
            finalState   = 'Cancelled';
            cancelReason = 'Cancelled during pause';
            updateProg(i, { status: 'skipped' });
            pushEvent('Cancelled', 'Run cancelled during pause');
            break;
          }
          setState('Running');
          pushEvent('Resumed', `Resumed at step ${s.step_number}`, s.id, s.step_number);
        }

        // Simulate step execution with retries
        updateProg(i, { status: 'running', startedAt: now() });
        pushEvent('StepStarted',
          `Step ${s.step_number}: ${s.automation_config!.action}`, s.id, s.step_number);

        let stepPassed = false;
        let lastError  = '';

        for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
          if (attempt > 0) {
            updateProg(i, { status: 'retrying', retryCount: attempt });
            pushEvent('StepRetrying',
              `Retrying step ${s.step_number} (attempt ${attempt + 1})`, s.id, s.step_number);
            await delay(cfg.retryDelayMs);
          }

          // Simulate step execution (always passes in simulation)
          const stepDuration = cfg.stepDelayMs + Math.floor(Math.random() * 200);
          await delay(stepDuration);

          // Simulation: all steps pass (real agent would call driver here)
          stepPassed = true;
          evidCount++;
          const completedAt = now();
          updateProg(i, {
            status: 'passed', duration_ms: stepDuration,
            completedAt, retryCount: attempt,
          });
          setEvidenceCount(evidCount);
          pushEvent('StepPassed',
            `Step ${s.step_number} passed (${stepDuration}ms)`, s.id, s.step_number);
          break;
        }

        if (!stepPassed) {
          updateProg(i, { status: 'failed', error: lastError, completedAt: now() });
          pushEvent('StepFailed',
            `Step ${s.step_number} failed: ${lastError}`, s.id, s.step_number);

          if (cfg.mode === 'SemiAuto') {
            setState('PausedOnFailure');
            pushEvent('PausedOnFailure',
              `Paused — step ${s.step_number} failed, awaiting decision`, s.id, s.step_number);
            const decision = await waitForDecision();
            if (decision === 'abort') {
              finalState   = 'Cancelled';
              cancelReason = 'Aborted on failure';
              pushEvent('Cancelled', 'Run aborted by user after failure');
              break;
            }
            if (decision === 'skip') {
              updateProg(i, { status: 'skipped' });
              pushEvent('StepSkipped',
                `Step ${s.step_number} skipped by user`, s.id, s.step_number);
              setState('Running');
              i++;
              continue;
            }
            if (decision === 'retry') {
              setState('Running');
              continue;  // retry without incrementing i
            }
          }

          if (cfg.stopOnFailure) {
            finalState = 'Failed';
            runError   = lastError;
            pushEvent('RunFailed', `Run stopped on step ${s.step_number} failure`);
            break;
          }
        }

        i++;
      }

      // Finalize
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      const duration_ms = Date.now() - t0Ref.current;
      setElapsedMs(duration_ms);

      if (finalState === 'Running') {
        finalState = 'Completed';
        pushEvent('RunCompleted',
          `Run completed — ${initialProgress.filter(p => p.status === 'passed').length}/${autoSteps.length} passed`);
      }

      setState(finalState);
      setReport({
        runId,
        state:          finalState,
        mode:           cfg.mode,
        totalSteps:     autoSteps.length,
        passedSteps:    initialProgress.filter(p => p.status === 'passed').length,
        failedSteps:    initialProgress.filter(p => p.status === 'failed').length,
        skippedSteps:   initialProgress.filter(p => p.status === 'skipped').length,
        duration_ms,
        stepProgress:   [...initialProgress],
        startedAt,
        completedAt:    now(),
        error:          runError   || undefined,
        cancelReason:   cancelReason || undefined,
        evidenceCount:  evidCount,
        timelineEvents: [...tl],
      });
    })();
  }, [waitForResume, waitForDecision]);

  // ── Controls ───────────────────────────────────────────────────────────────

  const pause    = useCallback(() => { pauseRef.current = true; }, []);
  const resume   = useCallback(() => { resumeRef.current = true; }, []);
  const cancel   = useCallback(() => {
    cancelRef.current  = true;
    resumeRef.current  = true;   // unblock any pause wait
    decisionRef.current = 'abort';
    setState('Cancelling');
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const confirmStep = useCallback(() => { resumeRef.current = true; }, []);

  const retryStep = useCallback((_stepIndex: number) => {
    decisionRef.current = 'retry';
  }, []);

  const skipStep = useCallback(() => {
    decisionRef.current = 'skip';
  }, []);

  const reset = useCallback(() => {
    cancelRef.current   = false;
    pauseRef.current    = false;
    resumeRef.current   = false;
    decisionRef.current = null;
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
    start, pause, resume, cancel, retryStep, skipStep, confirmStep, reset,
  };
}
