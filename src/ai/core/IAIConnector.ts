import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIConnectorCapabilities,
  ConnectorHealth,
  ConnectorConfigSchema,
  ConnectorType,
} from '../types/AITypes';

export interface IAIConnector {
  readonly id:   string;
  readonly name: string;
  readonly type: ConnectorType;

  connect():    Promise<void>;
  disconnect(): Promise<void>;

  health():       Promise<ConnectorHealth>;
  capabilities(): AIConnectorCapabilities;

  execute(request: AIRequest): Promise<AIResponse>;
  stream(request:  AIRequest): AsyncIterable<AIStreamChunk>;
  cancel(requestId: string):   Promise<void>;

  configurationSchema(): ConnectorConfigSchema;
}
