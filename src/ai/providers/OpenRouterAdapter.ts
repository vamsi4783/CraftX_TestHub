import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseProviderAdapter }           from './BaseProviderAdapter';

export class OpenRouterAdapter extends BaseProviderAdapter {
  readonly id           = 'openrouter';
  readonly name         = 'OpenRouter';
  readonly type         = 'api_provider' as const;
  readonly modelId      = 'openrouter/auto';
  readonly providerName = 'OpenRouter';

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      true,
      supportsStreaming:    true,
      supportsJSON:        true,
      supportsTools:       true,
      supportsReasoning:   true,
      supportsLongContext: true,
      supportsImages:      true,
      supportsFiles:       false,
      maxContextTokens:    200_000,
      maxOutputTokens:     32_768,
    };
  }
}
