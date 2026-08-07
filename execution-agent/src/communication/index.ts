// ─── Communication barrel export ──────────────────────────────────────────────

export { PROTOCOL_VERSION }              from './MessageProtocol.js';
export type {
  MessageType, CommandType,
  BaseMessage, CommandMessage, EventMessage, HeartbeatMessage,
  ResponseMessage, ErrorMessage, AuthHandshakeMessage, AuthResultMessage,
  AgentMessage,
  ExecuteTestPayload, CancelExecutionPayload, GetHealthPayload,
}                                        from './MessageProtocol.js';

export { MessageSerializer, MessageParseError } from './MessageSerializer.js';

export {
  DEFAULT_RECONNECT_POLICY,
  evaluateReconnect,
}                                        from './ReconnectStrategy.js';
export type { ReconnectPolicy, ReconnectDecision } from './ReconnectStrategy.js';

export {
  AgentConnectionManager,
  IllegalConnectionTransitionError,
}                                        from './AgentConnectionManager.js';
export type {
  ConnectionState,
  ConnectionManagerCallbacks,
}                                        from './AgentConnectionManager.js';

export { ConnectionDiagnostics }         from './ConnectionDiagnostics.js';
export type { ConnectionDiagnosticSnapshot } from './ConnectionDiagnostics.js';

export { CommandRouter }                 from './CommandRouter.js';
export { EventForwarder }                from './EventForwarder.js';

export { ManualTransport, ManualTransportFactory } from './ManualTransport.js';
export { WS_TRANSPORT_FACTORY }          from './WsTransportFactory.js';

export {
  AgentServer,
  REAL_SERVER_TIMER,
  INSTANT_SERVER_TIMER,
}                                        from './AgentServer.js';
export type { AgentServerConfig, ServerTimer } from './AgentServer.js';
