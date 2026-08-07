import { AIConnectorError } from '../types/AITypes';
import type { AIRequest, AIResponse } from '../types/AITypes';
import type { IAIProvider }           from '../core/IAIProvider';
import { BaseConnector }              from '../connectors/BaseConnector';

/**
 * Base class for all hosted / local model provider adapters.
 * Concrete implementations add authentication and API calls.
 * Stubs throw NOT_IMPLEMENTED to signal "register a real connector".
 */
export abstract class BaseProviderAdapter extends BaseConnector implements IAIProvider {
  abstract readonly modelId:      string;
  abstract readonly providerName: string;

  async listModels(): Promise<string[]> {
    return [this.modelId];
  }

  estimateCost(_inputTokens: number, _outputTokens: number): number {
    return 0;
  }

  async execute(_request: AIRequest): Promise<AIResponse> {
    throw new AIConnectorError(
      `${this.name} adapter is a stub. Register a real implementation before executing.`,
      'NOT_IMPLEMENTED',
      this.id,
    );
  }
}
