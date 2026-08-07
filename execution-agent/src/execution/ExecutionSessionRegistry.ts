// ─── ExecutionSessionRegistry ─────────────────────────────────────────────────
// Tracks every active execution session so the hub can cancel, pause, or resume
// a running session on behalf of a browser command.
//
// One entry per active sessionId. Entries are unregistered when the run resolves.

import { StructuredLogger }      from '../logging/StructuredLogger.js';
import { CancellationTokenSource } from '../drivers/DriverCancellation.js';
import type { PauseResumeSignal }  from '../runner/AutonomousRunnerTypes.js';

export interface SessionEntry {
  readonly cts:        CancellationTokenSource;
  readonly signal:     PauseResumeSignal;
  readonly testCaseId: string;
  readonly driverId:   string;
  readonly startedAt:  string;
}

export class ExecutionSessionRegistry {
  private readonly logger   = new StructuredLogger('ExecutionSessionRegistry');
  private readonly sessions = new Map<string, SessionEntry>();

  register(
    sessionId:  string,
    cts:        CancellationTokenSource,
    signal:     PauseResumeSignal,
    testCaseId: string,
    driverId:   string,
  ): void {
    this.sessions.set(sessionId, {
      cts, signal, testCaseId, driverId,
      startedAt: new Date().toISOString(),
    });
    this.logger.info('session_registered', { session_id: sessionId, driver_id: driverId });
  }

  cancel(sessionId: string, reason = 'user_cancel'): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      this.logger.warn('cancel_unknown_session', { session_id: sessionId });
      return false;
    }
    entry.cts.cancel();
    // Also signal abort to unblock any pause wait-loop
    entry.signal.failureDecision = 'abort';
    entry.signal.resumeConfirmed = true;
    this.logger.info('session_cancelled', { session_id: sessionId, reason });
    return true;
  }

  pause(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    entry.signal.pauseRequested = true;
    this.logger.info('session_pause_requested', { session_id: sessionId });
    return true;
  }

  resume(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    entry.signal.pauseRequested  = false;
    entry.signal.resumeConfirmed = true;
    this.logger.info('session_resumed', { session_id: sessionId });
    return true;
  }

  unregister(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.logger.info('session_unregistered', { session_id: sessionId });
  }

  get(sessionId: string): SessionEntry | undefined {
    return this.sessions.get(sessionId);
  }

  activeCount(): number {
    return this.sessions.size;
  }
}
