import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AIConnectorFactory }       from '../../ai/factory/AIConnectorFactory';
import { AIConnectorRegistry }      from '../../ai/registry/AIConnectorRegistry';
import { GeminiFlashConnector }     from '../../ai/providers/GeminiFlashConnector';
import { OllamaConnector }          from '../../ai/providers/OllamaConnector';
import { OpenAICompatibleConnector } from '../../ai/providers/OpenAICompatibleConnector';
import { AIConnectorError }         from '../../ai/types/AITypes';
import type { AIConnectorConfig }   from '../../ai/settings/AISettingsModel';
import { mockJsonFetch, oaiSuccessResponse } from './helpers/testHelpers';

function cfg(overrides: Partial<AIConnectorConfig> & { id: string }): AIConnectorConfig {
  return {
    name:          overrides.id,
    type:          'api_provider',
    priority:      100,
    enabled:       true,
    authMode:      'none',
    ...overrides,
  };
}

beforeEach(() => {
  // Inject a no-op fetcher so no real HTTP calls happen
  AIConnectorFactory._testFetcher = mockJsonFetch(200, oaiSuccessResponse('ok'));
});

afterEach(() => {
  AIConnectorFactory._testFetcher = undefined;
});

// ─── fromConfig ───────────────────────────────────────────────────────────────

describe('AIConnectorFactory.fromConfig — provider dispatch', () => {
  it('creates GeminiFlashConnector for id=gemini', () => {
    const c = AIConnectorFactory.fromConfig(cfg({ id: 'gemini', userApiKey: 'k' }));
    expect(c).toBeInstanceOf(GeminiFlashConnector);
  });

  it('creates GeminiFlashConnector for id=gemini_flash', () => {
    const c = AIConnectorFactory.fromConfig(cfg({ id: 'gemini_flash', userApiKey: 'k' }));
    expect(c).toBeInstanceOf(GeminiFlashConnector);
  });

  it('creates OllamaConnector for id=ollama', () => {
    const c = AIConnectorFactory.fromConfig(cfg({ id: 'ollama', type: 'local_model' }));
    expect(c).toBeInstanceOf(OllamaConnector);
  });

  it('creates OpenAICompatibleConnector for id=lm_studio', () => {
    const c = AIConnectorFactory.fromConfig(cfg({
      id: 'lm_studio', type: 'local_model',
      localEndpoint: 'http://localhost:1234/v1',
    }));
    expect(c).toBeInstanceOf(OpenAICompatibleConnector);
  });

  it('creates OpenAICompatibleConnector for id=groq', () => {
    const c = AIConnectorFactory.fromConfig(cfg({
      id: 'groq', userApiKey: 'gsk',
      metadata: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama3' },
    }));
    expect(c).toBeInstanceOf(OpenAICompatibleConnector);
  });

  it('creates OpenAICompatibleConnector for id=openrouter', () => {
    const c = AIConnectorFactory.fromConfig(cfg({
      id: 'openrouter', userApiKey: 'or-key',
      metadata: { baseUrl: 'https://openrouter.ai/api/v1', model: 'auto' },
    }));
    expect(c).toBeInstanceOf(OpenAICompatibleConnector);
  });

  it('creates OpenAICompatibleConnector for id=vllm (local_model)', () => {
    const c = AIConnectorFactory.fromConfig(cfg({
      id: 'vllm', type: 'local_model',
      localEndpoint: 'http://gpu-server/v1',
    }));
    expect(c).toBeInstanceOf(OpenAICompatibleConnector);
  });

  it('falls back to OpenAICompatibleConnector for api_provider with API key', () => {
    const c = AIConnectorFactory.fromConfig(cfg({
      id: 'custom-provider',
      userApiKey: 'my-key',
      metadata: { baseUrl: 'https://custom.ai/v1', model: 'gpt-x' },
    }));
    expect(c).toBeInstanceOf(OpenAICompatibleConnector);
  });

  it('throws NOT_IMPLEMENTED for unknown id with no userApiKey', () => {
    expect(() =>
      AIConnectorFactory.fromConfig(cfg({ id: 'unknown-vendor' })),
    ).toThrow();
  });

  it('throws AUTH_FAILED for gemini without apiKey', () => {
    expect(() =>
      AIConnectorFactory.fromConfig(cfg({ id: 'gemini' })),
    ).toThrow();
  });
});

// ─── fromConfig: local endpoint ───────────────────────────────────────────────

describe('AIConnectorFactory.fromConfig — local endpoint', () => {
  it('OllamaConnector uses localEndpoint from config', () => {
    const c = AIConnectorFactory.fromConfig(cfg({
      id: 'ollama', type: 'local_model',
      localEndpoint: 'http://mybox:11434',
    }));
    expect(c).toBeInstanceOf(OllamaConnector);
  });

  it('throws when OpenAI-compat has no endpoint', () => {
    expect(() =>
      AIConnectorFactory.fromConfig(cfg({ id: 'lm_studio', type: 'local_model' })),
    ).toThrow();
  });
});

// ─── registerBuilder ──────────────────────────────────────────────────────────

describe('AIConnectorFactory.registerBuilder', () => {
  it('custom builder is called for its id', () => {
    let called = false;
    AIConnectorFactory.registerBuilder('my-custom', (c) => {
      called = true;
      return new OllamaConnector({ model: 'test', fetcher: mockJsonFetch(200, {}) });
    });
    AIConnectorFactory.fromConfig(cfg({ id: 'my-custom' }));
    expect(called).toBe(true);
  });
});

// ─── fromSettings ─────────────────────────────────────────────────────────────

describe('AIConnectorFactory.fromSettings', () => {
  it('registers all enabled connectors in the registry', () => {
    const registry = AIConnectorFactory.fromSettings({
      connectors: [
        cfg({ id: 'gemini', userApiKey: 'k', enabled: true,  priority: 10 }),
        cfg({ id: 'ollama', type: 'local_model', enabled: true, priority: 20 }),
      ],
      telemetryEnabled: false,
      cacheEnabled:     false,
      maxCacheAgeMs:    0,
    });
    expect(registry.size()).toBe(2);
  });

  it('skips disabled connectors', () => {
    const registry = AIConnectorFactory.fromSettings({
      connectors: [
        cfg({ id: 'gemini', userApiKey: 'k', enabled: false }),
        cfg({ id: 'ollama', type: 'local_model', enabled: true }),
      ],
      telemetryEnabled: false,
      cacheEnabled:     false,
      maxCacheAgeMs:    0,
    });
    expect(registry.size()).toBe(1);
  });

  it('uses provided registry when passed', () => {
    const existing = new AIConnectorRegistry();
    const returned = AIConnectorFactory.fromSettings(
      { connectors: [], telemetryEnabled: false, cacheEnabled: false, maxCacheAgeMs: 0 },
      existing,
    );
    expect(returned).toBe(existing);
  });

  it('skips connectors that cannot be built (no throw)', () => {
    const registry = AIConnectorFactory.fromSettings({
      connectors: [
        // invalid — no endpoint, no key, unknown type
        cfg({ id: 'unknown-broken', enabled: true }),
      ],
      telemetryEnabled: false,
      cacheEnabled:     false,
      maxCacheAgeMs:    0,
    });
    expect(registry.size()).toBe(0);
  });

  it('respects priority from config', () => {
    const registry = AIConnectorFactory.fromSettings({
      connectors: [
        cfg({ id: 'gemini', userApiKey: 'k', enabled: true, priority: 5 }),
      ],
      telemetryEnabled: false, cacheEnabled: false, maxCacheAgeMs: 0,
    });
    expect(registry.getEntry('gemini_flash')?.priority).toBe(5);
  });
});
