import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseProviderAdapter }           from './BaseProviderAdapter';

export class ClaudeAdapter extends BaseProviderAdapter {
  readonly id           = 'claude';
  readonly name         = 'Claude';
  readonly type         = 'api_provider' as const;
  readonly modelId      = 'claude-sonnet-4-6';
  readonly providerName = 'Anthropic';

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
      maxOutputTokens:     64_000,
    };
  }
}
