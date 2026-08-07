// ─── CommandRouter ────────────────────────────────────────────────────────────
// Routes inbound CommandMessages to the appropriate AgentRuntime method.
// Returns a ResponseMessage — never throws (errors are captured in the response).

import { uuidv7 }              from 'uuidv7';
import { PROTOCOL_VERSION }    from './MessageProtocol.js';
import { StructuredLogger }    from '../logging/StructuredLogger.js';
import type {
  CommandMessage,
  ResponseMessage,
}                              from './MessageProtocol.js';
import type { AgentRuntime }  from '../runtime/AgentRuntime.js';

export class CommandRouter {
  private readonly logger = new StructuredLogger('CommandRouter');

  constructor(private readonly runtime: AgentRuntime) {}

  /**
   * Route a command to the runtime and return a ResponseMessage.
   * Always resolves — exceptions are captured and returned as error responses.
   */
  async route(cmd: CommandMessage): Promise<ResponseMessage> {
    this.logger.info('command_received', { commandType: cmd.commandType, messageId: cmd.messageId });

    try {
      switch (cmd.commandType) {
        case 'GetHealth':       return this._getHealth(cmd);
        case 'GetDiagnostics':  return this._getDiagnostics(cmd);
        case 'CancelExecution': return this._cancelExecution(cmd);
        case 'ExecuteTest':     return this._executeTest(cmd);
        default: {
          // TypeScript exhaustiveness guard
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
    const report  = this.runtime.collectHealth(
      payload.activeExecutions ?? 0,
      payload.queueDepth ?? 0,
    );
    return this._ok(cmd, {
      status:           report.status,
      cpuPercent:       report.cpuPercent,
      memoryUsedMb:     report.memoryUsedMb,
      memoryTotalMb:    report.memoryTotalMb,
      uptimeMs:         report.uptimeMs,
      activeExecutions: report.activeExecutions,
      queueDepth:       report.queueDepth,
      connectedDrivers: report.connectedDrivers,
      connectedDevices: report.connectedDevices,
    });
  }

  private _getDiagnostics(cmd: CommandMessage): ResponseMessage {
    const snap = this.runtime.snapshot();
    return this._ok(cmd, snap as unknown as Record<string, unknown>);
  }

  private _cancelExecution(cmd: CommandMessage): ResponseMessage {
    const payload = cmd.payload as { sessionId?: string; reason?: string };
    if (!payload.sessionId) {
      return this._errorResponse(cmd, 'CancelExecution requires sessionId in payload');
    }
    // Phase 9 will wire this to an active ExecutionEngine cancellation token.
    // For Phase 3, acknowledge the intent and log it.
    this.logger.info('cancel_execution_requested', {
      session_id: payload.sessionId,
      reason:     payload.reason ?? 'unspecified',
    });
    return this._ok(cmd, { acknowledged: true, sessionId: payload.sessionId });
  }

  private _executeTest(cmd: CommandMessage): ResponseMessage {
    const payload = cmd.payload as { sessionId?: string; testCaseId?: string; driverId?: string };
    if (!payload.sessionId || !payload.testCaseId || !payload.driverId) {
      return this._errorResponse(cmd, 'ExecuteTest requires sessionId, testCaseId, driverId');
    }
    // Phase 9 will wire this to ExecutionEngine.execute().
    // For Phase 3, acknowledge the intent and log it.
    this.logger.info('execute_test_requested', {
      session_id:   payload.sessionId,
      test_case_id: payload.testCaseId,
      driver_id:    payload.driverId,
    });
    return this._ok(cmd, { acknowledged: true, sessionId: payload.sessionId });
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
