import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseProviderAdapter }           from './BaseProviderAdapter';

export class VLLMAdapter extends BaseProviderAdapter {
  readonly id           = 'vllm';
  readonly name         = 'vLLM';
  readonly type         = 'local_model' as const;
  readonly modelId      = 'mistral-7b';
  readonly providerName = 'vLLM';

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      false,
      supportsStreaming:    true,
      supportsJSON:        true,
      supportsTools:       false,
      supportsReasoning:   false,
      supportsLongContext: true,
      supportsImages:      false,
      supportsFiles:       false,
      maxContextTokens:    32_768,
      maxOutputTokens:     8_192,
    };
  }
}
