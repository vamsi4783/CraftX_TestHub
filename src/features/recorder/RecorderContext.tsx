import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { assertTransition } from './stateMachine';
import type {
  RecordingConfig,
  RecordingSession,
  RecordingState,
  RunnerStatus,
  ScreenshotRecord,
  ScreenshotType,
  StorageEstimate,
  TimelineEvent,
  TimelineEventType,
} from './types';
import { recorderService } from '@/services/recorderService';
import { useAuth } from '@/hooks/useAuth';

// ─── Context shape ─────────────────────────────────────────────────────────────

interface RecorderContextValue {
  state:           RecordingState;
  session:         RecordingSession | null;
  timeline:        TimelineEvent[];
  screenshots:     ScreenshotRecord[];
  elapsedMs:       number;
  runnerStatus:    RunnerStatus;
  storageEstimate: StorageEstimate;
  error:           string | null;

  initialize:      (config: RecordingConfig) => Promise<void>;
  startRecording:  () => Promise<void>;
  pause:           () => Promise<void>;
  resume:          () => Promise<void>;
  stop:            () => Promise<void>;
  cancel:          () => Promise<void>;
  reset:           () => void;

  addAction:        (description: string, metadata?: Record<string, unknown>) => void;
  addAnnotation:    (text: string) => void;
  captureScreenshot:(type: ScreenshotType, localPath?: string) => Promise<void>;
}

const RecorderContext = createContext<RecorderContextValue | null>(null);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function genId(): string {
  return crypto.randomUUID();
}

function localFolder(execId: string): string {
  return `TestHub/Executions/${execId}`;
}

// ─── Provider ──────────────────────────────────────────────────────────────────

export function RecorderProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();

  const [state,       setState]       = useState<RecordingState>('IDLE');
  const [session,     setSession]     = useState<RecordingSession | null>(null);
  const [timeline,    setTimeline]    = useState<TimelineEvent[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotRecord[]>([]);
  const [elapsedMs,   setElapsedMs]   = useState(0);
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>('disconnected');
  const [error,       setError]       = useState<string | null>(null);

  // Stable refs so async callbacks always read latest values without
  // being listed as effect dependencies.
  const sessionRef     = useRef<RecordingSession | null>(null);
  const timelineRef    = useRef<TimelineEvent[]>([]);
  const screenshotsRef = useRef<ScreenshotRecord[]>([]);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { sessionRef.current     = session;     }, [session]);
  useEffect(() => { timelineRef.current    = timeline;    }, [timeline]);
  useEffect(() => { screenshotsRef.current = screenshots; }, [screenshots]);

  // Clean up timer on unmount
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── Storage estimate (browser-side approximation) ───────────────────────────

  const storageEstimate: StorageEstimate = {
    screenshotCount: screenshots.length,
    estimatedMb: Math.round(
      screenshots.length * 0.2 +         // ~200 KB per screenshot
      (elapsedMs / 60_000) * 5           // ~5 MB per minute of video
    ),
  };

  // ── Timer ───────────────────────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const s = sessionRef.current;
      if (!s?.startedAt) return;
      const raw = Date.now() - s.startedAt.getTime();
      setElapsedMs(Math.max(0, raw - s.totalPausedMs));
    }, 250);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Safe state transition ───────────────────────────────────────────────────

  // We use functional setState so assertTransition sees the committed state,
  // not a stale closure. The assertion throws synchronously before setState
  // commits, which surfaces illegal transitions immediately in development.
  const go = useCallback((next: RecordingState) => {
    setState(prev => {
      assertTransition(prev, next);
      return next;
    });
  }, []);

  // ── Timeline helpers ────────────────────────────────────────────────────────

  const addEvent = useCallback((
    type: TimelineEventType,
    description: string,
    metadata?: Record<string, unknown>
  ): TimelineEvent => {
    const s = sessionRef.current;
    const offset = s?.startedAt
      ? Math.max(0, Date.now() - s.startedAt.getTime() - s.totalPausedMs)
      : 0;

    const event: TimelineEvent = { id: genId(), type, description, offsetMs: offset, metadata };
    setTimeline(prev => [...prev, event]);
    return event;
  }, []);

  const addAction = useCallback((description: string, metadata?: Record<string, unknown>) => {
    addEvent('action', description, metadata);
  }, [addEvent]);

  const addAnnotation = useCallback((text: string) => {
    addEvent('annotation', text);
  }, [addEvent]);

  // ── initialize ──────────────────────────────────────────────────────────────

  const initialize = useCallback(async (config: RecordingConfig) => {
    if (!profile) throw new Error('Must be logged in to initialize recorder');

    const execId = genId();
    const folder = localFolder(execId);

    const newSession: RecordingSession = {
      ...config,
      id:             '',          // filled after DB insert
      testerId:       profile.id,
      totalPausedMs:  0,
      screenshotCount: 0,
      localFolder:    folder,
    };

    // Stub: in production the RecorderBridge pings the Automation Runner here
    setRunnerStatus('connecting');
    await new Promise(r => setTimeout(r, 400)); // simulate handshake
    setRunnerStatus('connected');

    const recordingId = await recorderService.createRecording(newSession);
    newSession.id = recordingId;

    setSession(newSession);
    setTimeline([]);
    setScreenshots([]);
    setElapsedMs(0);
    setError(null);
    go('READY');
  }, [profile, go]);

  // ── startRecording ──────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) throw new Error('Recorder not initialized');

    const startedAt = new Date();
    setSession(prev => prev ? { ...prev, startedAt } : prev);

    // Stub: Automation Runner starts video capture and logcat here
    await recorderService.onStart(s.id);

    addEvent('recording_started', 'Recording started');
    startTimer();
    go('RECORDING');
  }, [go, startTimer, addEvent]);

  // ── pause ───────────────────────────────────────────────────────────────────

  const pause = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;

    stopTimer();
    const pausedAt = new Date();
    setSession(prev => prev ? { ...prev, lastPausedAt: pausedAt } : prev);

    // Stub: Runner pauses video. Logcat deliberately keeps running.
    await recorderService.onPause(s.id);

    addEvent('recording_paused', 'Recording paused');
    go('PAUSED');
  }, [go, stopTimer, addEvent]);

  // ── resume ──────────────────────────────────────────────────────────────────

  const resume = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;

    const additionalPausedMs = s.lastPausedAt
      ? Date.now() - s.lastPausedAt.getTime()
      : 0;
    const newTotalPausedMs = s.totalPausedMs + additionalPausedMs;

    setSession(prev =>
      prev ? { ...prev, totalPausedMs: newTotalPausedMs, lastPausedAt: undefined } : prev
    );

    // Stub: Runner resumes video from same file, no new segment created
    await recorderService.onResume(s.id, newTotalPausedMs);

    addEvent('recording_resumed', 'Recording resumed');
    startTimer();
    go('RECORDING');
  }, [go, startTimer, addEvent]);

  // ── stop ────────────────────────────────────────────────────────────────────

  const stop = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;

    stopTimer();
    const stoppedAt = new Date();
    const durationMs = s.startedAt
      ? stoppedAt.getTime() - s.startedAt.getTime() - s.totalPausedMs
      : 0;

    addEvent('recording_stopped', 'Recording stopped');
    go('STOPPING');

    // Stub: Runner stops video + flushes logcat
    await recorderService.onStop(s.id, durationMs, s.totalPausedMs);

    go('SAVING');

    // Flush timeline and screenshots to Supabase (metadata only)
    await recorderService.flushTimeline(s.id, timelineRef.current);

    await recorderService.finalize(s.id, {
      screenshotCount:    screenshotsRef.current.length,
      timelineEventCount: timelineRef.current.length,
      // video* and logcat* fields come from the Automation Runner in production
    });

    setSession(prev => prev ? { ...prev, stoppedAt } : prev);
    go('COMPLETED');
  }, [go, stopTimer, addEvent]);

  // ── cancel ──────────────────────────────────────────────────────────────────
  // Hard reset: deletes the DB row and all local files (files via Runner stub).
  // No execution record must remain after cancel.

  const cancel = useCallback(async () => {
    const s = sessionRef.current;
    stopTimer();

    if (s?.id) {
      // Cancel deletes the row + all cascaded children (timeline, screenshots)
      await recorderService.cancel(s.id).catch(() => null);
      // Stub: Runner deletes local Video/, Screenshots/, Logs/
    }

    // Wipe all in-memory state and return to IDLE directly
    setSession(null);
    setTimeline([]);
    setScreenshots([]);
    setElapsedMs(0);
    setError(null);
    setRunnerStatus('disconnected');
    setState('IDLE');
  }, [stopTimer]);

  // ── reset (after COMPLETED or ERROR) ────────────────────────────────────────

  const reset = useCallback(() => {
    stopTimer();
    setSession(null);
    setTimeline([]);
    setScreenshots([]);
    setElapsedMs(0);
    setError(null);
    setRunnerStatus('disconnected');
    setState('IDLE');
  }, [stopTimer]);

  // ── captureScreenshot ────────────────────────────────────────────────────────

  const captureScreenshot = useCallback(async (type: ScreenshotType, localPath?: string) => {
    const s = sessionRef.current;
    if (!s?.id) return;

    const path = localPath ?? `${s.localFolder}/Screenshots/${genId()}.png`;
    const offsetMs = s.startedAt
      ? Math.max(0, Date.now() - s.startedAt.getTime() - s.totalPausedMs)
      : 0;

    const record: ScreenshotRecord = {
      id: genId(), type, localPath: path, offsetMs, capturedAt: new Date(),
    };

    setScreenshots(prev => [...prev, record]);
    setSession(prev => prev ? { ...prev, screenshotCount: prev.screenshotCount + 1 } : prev);

    await recorderService.addScreenshot(s.id, record);
    addEvent('screenshot', `Screenshot captured (${type})`, { type, path });
  }, [addEvent]);

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <RecorderContext.Provider value={{
      state, session, timeline, screenshots,
      elapsedMs, runnerStatus, storageEstimate, error,
      initialize, startRecording, pause, resume, stop, cancel, reset,
      addAction, addAnnotation, captureScreenshot,
    }}>
      {children}
    </RecorderContext.Provider>
  );
}

export function useRecorderContext(): RecorderContextValue {
  const ctx = useContext(RecorderContext);
  if (!ctx) throw new Error('useRecorderContext must be used within <RecorderProvider>');
  return ctx;
}
