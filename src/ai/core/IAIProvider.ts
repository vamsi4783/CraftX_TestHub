import type { IAIConnector } from './IAIConnector';

/**
 * Specialized interface for hosted or local model APIs.
 * Examples: Gemini, Claude, OpenAI, GitHub Models, Ollama, OpenRouter.
 */
export interface IAIProvider extends IAIConnector {
  readonly modelId:      string;
  readonly providerName: string;

  listModels():                                           Promise<string[]>;
  estimateCost(inputTokens: number, outputTokens: number): number;
}
