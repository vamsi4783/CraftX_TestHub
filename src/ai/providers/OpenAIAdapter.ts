import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseProviderAdapter }           from './BaseProviderAdapter';

export class OpenAIAdapter extends BaseProviderAdapter {
  readonly id           = 'openai';
  readonly name         = 'OpenAI';
  readonly type         = 'api_provider' as const;
  readonly modelId      = 'gpt-4o';
  readonly providerName = 'OpenAI';

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      true,
      supportsStreaming:    true,
      supportsJSON:        true,
      supportsTools:       true,
      supportsReasoning:   true,
      supportsLongContext: true,
      supportsImages:      true,
      supportsFiles:       true,
      maxContextTokens:    128_000,
      maxOutputTokens:     16_384,
    };
  }
}
