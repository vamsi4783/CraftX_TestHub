// ─── Execution Agent — Public Library Exports ─────────────────────────────────
// Use `npm run start` (dist/main.js) to run the agent process.
// These exports are for embedding the agent in test harnesses.

export * from './events/index.js';
export * from './drivers/index.js';
export * from './evidence/index.js';
export * from './engine/index.js';

// Communication — named exports to avoid conflicts with events barrel
export { AgentHubServer }          from './communication/AgentHubServer.js';
export { CommandRouter }           from './communication/CommandRouter.js';
export { EventForwarder }          from './communication/EventForwarder.js';
export { MessageSerializer }       from './communication/MessageSerializer.js';
export { PROTOCOL_VERSION }        from './communication/MessageProtocol.js';
export type {
  AgentMessage, CommandType, CommandMessage, EventMessage,
  HeartbeatMessage, ResponseMessage, ErrorMessage,
  AuthHandshakeMessage, AuthResultMessage,
  ExecuteTestPayload,
  PauseExecutionPayload,
  ResumeExecutionPayload,
  GetHealthPayload,
  GetDiagnosticsPayload,
}                                  from './communication/MessageProtocol.js';

// Execution
export { ExecutionEngine }         from './execution/ExecutionEngine.js';
export { ExecutionSessionRegistry } from './execution/ExecutionSessionRegistry.js';
export { WebSocketEventEmitter }   from './execution/events/WebSocketEventEmitter.js';
export type { ExecutionRequest, ExecutionResult, ExecutionStep, StepResult, ExecutionState }
                                   from './execution/ExecutionTypes.js';

// Runner
export { AutonomousRunnerEngine }  from './runner/AutonomousRunnerEngine.js';
export type {
  RunnerConfig, RunnerReport, RunnerState, StepProgress,
  PauseResumeSignal, RunnerTimelineEvent,
}                                  from './runner/AutonomousRunnerTypes.js';
export { DEFAULT_RUNNER_CONFIG, makePauseResumeSignal }
                                   from './runner/AutonomousRunnerTypes.js';

// Runtime
export { AgentRuntime }            from './runtime/AgentRuntime.js';
export { buildRuntimeConfig }      from './runtime/RuntimeConfiguration.js';
export { makeNodeSystemMetrics }   from './runtime/HealthMonitor.js';
