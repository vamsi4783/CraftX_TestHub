import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseProviderAdapter }           from './BaseProviderAdapter';

export class AzureOpenAIAdapter extends BaseProviderAdapter {
  readonly id           = 'azure_openai';
  readonly name         = 'Azure OpenAI';
  readonly type         = 'api_provider' as const;
  readonly modelId      = 'gpt-4o';
  readonly providerName = 'Microsoft Azure';

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      true,
      supportsStreaming:    true,
      supportsJSON:        true,
      supportsTools:       true,
      supportsReasoning:   false,
      supportsLongContext: true,
      supportsImages:      true,
      supportsFiles:       false,
      maxContextTokens:    128_000,
      maxOutputTokens:     16_384,
    };
  }
}
