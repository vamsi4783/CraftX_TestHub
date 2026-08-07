import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseProviderAdapter }           from './BaseProviderAdapter';

export class GitHubModelsAdapter extends BaseProviderAdapter {
  readonly id           = 'github_models';
  readonly name         = 'GitHub Models';
  readonly type         = 'api_provider' as const;
  readonly modelId      = 'gpt-4o';
  readonly providerName = 'GitHub';

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
      maxOutputTokens:     4_096,
    };
  }
}
