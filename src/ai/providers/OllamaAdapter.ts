import type { AIConnectorCapabilities } from '../types/AITypes';
import { BaseProviderAdapter }           from './BaseProviderAdapter';

export class OllamaAdapter extends BaseProviderAdapter {
  readonly id           = 'ollama';
  readonly name         = 'Ollama';
  readonly type         = 'local_model' as const;
  readonly modelId      = 'llama3.2';
  readonly providerName = 'Ollama';

  capabilities(): AIConnectorCapabilities {
    return {
      supportsVision:      false,
      supportsStreaming:    true,
      supportsJSON:        true,
      supportsTools:       true,
      supportsReasoning:   false,
      supportsLongContext: false,
      supportsImages:      false,
      supportsFiles:       false,
      maxContextTokens:    8_192,
      maxOutputTokens:     4_096,
    };
  }
}
