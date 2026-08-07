import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseProviderAdapter }           from './BaseProviderAdapter';

export class LMStudioAdapter extends BaseProviderAdapter {
  readonly id           = 'lm_studio';
  readonly name         = 'LM Studio';
  readonly type         = 'local_model' as const;
  readonly modelId      = 'local-model';
  readonly providerName = 'LM Studio';

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      false,
      supportsStreaming:    true,
      supportsJSON:        true,
      supportsTools:       false,
      supportsReasoning:   false,
      supportsLongContext: false,
      supportsImages:      false,
      supportsFiles:       false,
      maxContextTokens:    32_768,
      maxOutputTokens:     4_096,
    };
  }
}
