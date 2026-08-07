import { AIConnectorError, ZERO_CAPABILITIES } from '../types/AITypes';
import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIConnectorCapabilities,
  ConnectorHealth,
  ConnectorConfigSchema,
  ConnectorType,
} from '../types/AITypes';
import type { IAIConnector } from '../core/IAIConnector';

/**
 * Minimal base for all connector implementations.
 * Subclasses override only what they need.
 */
export abstract class BaseConnector implements IAIConnector {
  abstract readonly id:   string;
  abstract readonly name: string;
  abstract readonly type: ConnectorType;

  async connect():    Promise<void> {}
  async disconnect(): Promise<void> {}

  async health(): Promise<ConnectorHealth> {
    return { status: 'disconnected', checkedAt: new Date().toISOString() };
  }

  capabilities(): AIConnectorCapabilities {
    return ZERO_CAPABILITIES;
  }

  abstract execute(request: AIRequest): Promise<AIResponse>;

  // eslint-disable-next-line require-yield
  async *stream(_request: AIRequest): AsyncGenerator<AIStreamChunk> {
    throw new AIConnectorError(
      `${this.name} does not support streaming`,
      'NOT_IMPLEMENTED',
      this.id,
    );
  }

  async cancel(_requestId: string): Promise<void> {}

  configurationSchema(): ConnectorConfigSchema {
    return { fields: [] };
  }
}
