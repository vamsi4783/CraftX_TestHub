import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseProviderAdapter }           from './BaseProviderAdapter';

export class GeminiAdapter extends BaseProviderAdapter {
  readonly id           = 'gemini';
  readonly name         = 'Gemini';
  readonly type         = 'api_provider' as const;
  readonly modelId      = 'gemini-2.0-flash';
  readonly providerName = 'Google';

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
      maxContextTokens:    1_000_000,
      maxOutputTokens:     8_192,
    };
  }
}
