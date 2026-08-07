// ─── CommandRouter ────────────────────────────────────────────────────────────
// Routes inbound CommandMessages to the appropriate handler.
// Returns a ResponseMessage — never throws.
//
// Phase 5: ExecuteTest fires the AutonomousRunnerEngine async and returns an
// immediate acknowledgement. Events are pushed to browser clients via
// EventForwarder as steps complete. CancelExecution / PauseExecution /
// ResumeExecution delegate to ExecutionSessionRegistry.

import { uuidv7 }                      from 'uuidv7';
import { CancellationTokenSource }     from '../drivers/DriverCancellation.js';
import { makePauseResumeSignal,
         DEFAULT_RUNNER_CONFIG }       from '../runner/AutonomousRunnerTypes.js';
import { PROTOCOL_VERSION }            from './MessageProtocol.js';
import { StructuredLogger }            from '../logging/StructuredLogger.js';
import type { CommandMessage,
              ResponseMessage }        from './MessageProtocol.js';
import type { AgentRuntime }          from '../runtime/AgentRuntime.js';
import type { AutonomousRunnerEngine } from '../runner/AutonomousRunnerEngine.js';
import type { ExecutionSessionRegistry } from '../execution/ExecutionSessionRegistry.js';
import type { ExecutionStep }         from '../execution/ExecutionTypes.js';

export class CommandRouter {
  private readonly logger = new StructuredLogger('CommandRouter');

  // Set after construction to break the circular hub → router dependency.
  private runner:   AutonomousRunnerEngine | null     = null;
  private registry: ExecutionSessionRegistry | null   = null;

  constructor(private readonly runtime: AgentRuntime) {}

  setExecutionDeps(
    runner:   AutonomousRunnerEngine,
    registry: ExecutionSessionRegistry,
    _forwarder: unknown,  // reserved for future direct use; forwarding happens via WebSocketEventEmitter
  ): void {
    this.runner   = runner;
    this.registry = registry;
  }

  /**
   * Route a command. Always resolves — exceptions are returned as error responses.
   */
  async route(cmd: CommandMessage): Promise<ResponseMessage> {
    this.logger.info('command_received', { commandType: cmd.commandType, messageId: cmd.messageId });

    try {
      switch (cmd.commandType) {
        case 'GetHealth':        return this._getHealth(cmd);
        case 'GetDiagnostics':   return this._getDiagnostics(cmd);
        case 'ExecuteTest':      return await this._executeTest(cmd);
        case 'CancelExecution':  return this._cancelExecution(cmd);
        case 'PauseExecution':   return this._pauseExecution(cmd);
        case 'ResumeExecution':  return this._resumeExecution(cmd);
        default: {
          const unknown = (cmd as CommandMessage).commandType;
          return this._errorResponse(cmd, `Unknown command type: ${unknown}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('command_error', { commandType: cmd.commandType, error: msg });
      return this._errorResponse(cmd, msg);
    }
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  private _getHealth(cmd: CommandMessage): ResponseMessage {
    const payload = cmd.payload as { activeExecutions?: number; queueDepth?: number };
    const active  = this.registry?.activeCount() ?? payload.activeExecutions ?? 0;
    const report  = this.runtime.collectHealth(active, payload.queueDepth ?? 0);
    return this._ok(cmd, {
      status:           report.status,
      cpuPercent:       report.cpuPercent,
      memoryUsedMb:     report.memoryUsedMb,
      memoryTotalMb:    report.memoryTotalMb,
      uptimeMs:         report.uptimeMs,
      activeExecutions: active,
      queueDepth:       report.queueDepth,
      connectedDrivers: report.connectedDrivers,
      connectedDevices: report.connectedDevices,
    });
  }

  private _getDiagnostics(cmd: CommandMessage): ResponseMessage {
    const snap = this.runtime.snapshot();
    return this._ok(cmd, snap as unknown as Record<string, unknown>);
  }

  private async _executeTest(cmd: CommandMessage): Promise<ResponseMessage> {
    const p = cmd.payload as {
      sessionId?:   string;
      testCaseId?:  string;
      driverId?:    string;
      steps?:       Array<{
        id?:               string;
        step_number:       number;
        automation_config: {
          driver_id:  string;
          action:     string;
          selector?:  string;
          value?:     string;
          timeout_ms?: number;
          params?:    Record<string, unknown>;
        };
        timeout_ms?: number;
      }>;
      driverConfig?: Record<string, unknown>;
    };

    if (!p.sessionId || !p.testCaseId || !p.driverId) {
      return this._errorResponse(cmd, 'ExecuteTest requires sessionId, testCaseId, driverId');
    }

    if (!this.runner || !this.registry) {
      return this._errorResponse(cmd, 'Execution engine not initialized — call setExecutionDeps first');
    }

    if (this.registry.get(p.sessionId)) {
      return this._errorResponse(cmd, `Session ${p.sessionId} is already active`);
    }

    // Build ExecutionStep[] from the payload steps
    const steps: ExecutionStep[] = (p.steps ?? []).map((s) => ({
      stepId:     s.id ?? uuidv7(),
      stepNumber: s.step_number,
      action:     s.automation_config,
      timeout_ms: s.timeout_ms,
    }));

    if (steps.length === 0) {
      return this._errorResponse(cmd, 'ExecuteTest: no steps provided in payload');
    }

    const cts    = new CancellationTokenSource();
    const signal = makePauseResumeSignal();
    this.registry.register(p.sessionId, cts, signal, p.testCaseId, p.driverId);

    const sessionId  = p.sessionId;
    const testCaseId = p.testCaseId;
    const driverId   = p.driverId;
    const driverConfig = p.driverConfig ?? {};
    const registry = this.registry;
    const runner   = this.runner;
    const logger   = this.logger;

    // Fire and forget — result events are forwarded via EventForwarder
    runner.run(
      sessionId,
      testCaseId,
      driverId,
      steps,
      { ...DEFAULT_RUNNER_CONFIG, mode: 'FullyAuto', stopOnFailure: false },
      signal,
      driverConfig,
    ).then((report) => {
      logger.info('execution_completed', {
        session_id: sessionId,
        state:      report.state,
        passed:     report.passedSteps,
        failed:     report.failedSteps,
        duration_ms: report.duration_ms,
      });
    }).catch((err: unknown) => {
      logger.error('execution_run_error', {
        session_id: sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }).finally(() => {
      registry.unregister(sessionId);
    });

    return this._ok(cmd, { acknowledged: true, sessionId, steps: steps.length });
  }

  private _cancelExecution(cmd: CommandMessage): ResponseMessage {
    const p = cmd.payload as { sessionId?: string; reason?: string };
    if (!p.sessionId) {
      return this._errorResponse(cmd, 'CancelExecution requires sessionId');
    }

    if (!this.registry) {
      return this._errorResponse(cmd, 'Session registry not initialized');
    }

    const cancelled = this.registry.cancel(p.sessionId, p.reason ?? 'user_cancel');
    if (!cancelled) {
      return this._errorResponse(cmd, `No active session: ${p.sessionId}`);
    }

    return this._ok(cmd, { acknowledged: true, sessionId: p.sessionId });
  }

  private _pauseExecution(cmd: CommandMessage): ResponseMessage {
    const p = cmd.payload as { sessionId?: string };
    if (!p.sessionId) return this._errorResponse(cmd, 'PauseExecution requires sessionId');
    if (!this.registry) return this._errorResponse(cmd, 'Session registry not initialized');

    const paused = this.registry.pause(p.sessionId);
    if (!paused) return this._errorResponse(cmd, `No active session: ${p.sessionId}`);

    return this._ok(cmd, { acknowledged: true, sessionId: p.sessionId });
  }

  private _resumeExecution(cmd: CommandMessage): ResponseMessage {
    const p = cmd.payload as { sessionId?: string };
    if (!p.sessionId) return this._errorResponse(cmd, 'ResumeExecution requires sessionId');
    if (!this.registry) return this._errorResponse(cmd, 'Session registry not initialized');

    const resumed = this.registry.resume(p.sessionId);
    if (!resumed) return this._errorResponse(cmd, `No active session: ${p.sessionId}`);

    return this._ok(cmd, { acknowledged: true, sessionId: p.sessionId });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _ok(cmd: CommandMessage, payload: Record<string, unknown>): ResponseMessage {
    return {
      messageId:       uuidv7(),
      correlationId:   cmd.correlationId,
      timestamp:       new Date().toISOString(),
      protocolVersion: PROTOCOL_VERSION,
      type:            'Response',
      requestId:       cmd.messageId,
      success:         true,
      payload,
    };
  }

  private _errorResponse(cmd: CommandMessage, detail: string): ResponseMessage {
    return {
      messageId:       uuidv7(),
      correlationId:   cmd.correlationId,
      timestamp:       new Date().toISOString(),
      protocolVersion: PROTOCOL_VERSION,
      type:            'Response',
      requestId:       cmd.messageId,
      success:         false,
      payload:         { error: detail },
    };
  }
}
