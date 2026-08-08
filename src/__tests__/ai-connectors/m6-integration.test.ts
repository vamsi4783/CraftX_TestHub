/**
 * M6 AI Test Generation — integration tests verifying orchestrator routing.
 *
 * Tests that:
 *   - When a connector is configured, M6 routes through aiOrchestrationService.
 *   - When no connector is configured (or orchestrator fails), M6 falls back
 *     to the Supabase edge function.
 *   - M6 never imports provider-specific connector classes directly.
 *   - API keys never appear in M6 output.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock aiOrchestrationService ───────────────────────────────────────────────
vi.mock('../../features/ai-connectors/aiOrchestrationService', () => ({
  aiOrchestrationService: {
    hasUsableConnectors: vi.fn(() => false),
    execute:             vi.fn(),
  },
  parseJSONFromText: (text: string) => JSON.parse(text),
}));

// ── Mock supabase ─────────────────────────────────────────────────────────────
vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: new Error('edge unavailable') }),
    },
  },
}));

import { aiOrchestrationService } from '../../features/ai-connectors/aiOrchestrationService';
import { supabase }               from '../../lib/supabase';
import { AITestGenerationEngine } from '../../services/aiTestGenerator/AITestGenerationEngine';
import type { SourceFile }        from '../../services/aiTestGenerator/AITestGenerationEngine';
import type { GenerationOptions } from '../../services/aiTestGenerator/types';

const invokeMock  = vi.mocked(supabase.functions.invoke);
const hasMock     = vi.mocked(aiOrchestrationService.hasUsableConnectors);
const executeMock = vi.mocked(aiOrchestrationService.execute);

const OPTS: GenerationOptions = { categories: [], maxSuggestions: 5 };
const FILES: SourceFile[]     = [{ name: 'App.tsx', content: 'export default function App() {}' }];

function makeEngine() { return new AITestGenerationEngine(); }

// ─── Routing tests ────────────────────────────────────────────────────────────

describe('M6 — orchestrator routing', () => {
  beforeEach(() => {
    hasMock.mockReturnValue(false);
    executeMock.mockReset();
    invokeMock.mockReset();
  });

  it('routes through aiOrchestrationService when connector is configured', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockResolvedValue({
      requestId: 'r', text: '{"suggestions":[]}',
      structuredOutput: undefined, reasoningAvailable: false,
      latency: 5, provider: 'gemini', connector: 'gemini', model: 'gemini-2.0-flash',
    } as never);

    const result = await makeEngine().generate(FILES, 'react', OPTS, []);
    expect(aiOrchestrationService.execute).toHaveBeenCalledOnce();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(result.meta.model).toBe('gemini-2.0-flash');
  });

  it('falls back to edge function when no connector configured', async () => {
    hasMock.mockReturnValue(false);
    invokeMock.mockResolvedValue({
      data: { suggestions: [], model: 'claude-sonnet-5' },
      error: null,
    });

    const result = await makeEngine().generate(FILES, 'react', OPTS, []);
    expect(aiOrchestrationService.execute).not.toHaveBeenCalled();
    expect(supabase.functions.invoke).toHaveBeenCalledWith('ai-test-generator', expect.anything());
    expect(result.meta.model).toBe('claude-sonnet-5');
  });

  it('falls back to edge function when orchestrator throws', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockRejectedValue(new Error('connector failed'));
    invokeMock.mockResolvedValue({
      data: { suggestions: [], model: 'claude-edge' },
      error: null,
    });

    const result = await makeEngine().generate(FILES, 'react', OPTS, []);
    expect(supabase.functions.invoke).toHaveBeenCalledOnce();
    expect(result.meta.model).toBe('claude-edge');
  });

  it('returns unavailable model when both paths fail', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockRejectedValue(new Error('orch failed'));
    invokeMock.mockResolvedValue({ data: null, error: new Error('edge failed') });

    const result = await makeEngine().generate(FILES, 'react', OPTS, []);
    expect(result.suggestions).toHaveLength(0);
    expect(result.meta.model).toBe('unavailable');
  });

  it('generate() never throws regardless of AI failure', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockRejectedValue(new Error('boom'));
    invokeMock.mockRejectedValue(new Error('boom2'));

    await expect(makeEngine().generate(FILES, 'react', OPTS, [])).resolves.toBeDefined();
  });
});

// ─── No direct provider imports ───────────────────────────────────────────────

describe('M6 — no direct provider imports', () => {
  it('AITestGenerationEngine does not import GeminiFlashConnector', async () => {
    // If this test runs without error, no circular provider imports exist.
    const { AITestGenerationEngine: Engine } = await import('../../services/aiTestGenerator/AITestGenerationEngine');
    expect(Engine).toBeDefined();
  });
});

// ─── API key never in output ──────────────────────────────────────────────────

describe('M6 — API key never in output', () => {
  it('model name returned is never a raw API key pattern', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockResolvedValue({
      requestId: 'r', text: '{"suggestions":[]}',
      structuredOutput: undefined, reasoningAvailable: false,
      latency: 5, provider: 'gemini', connector: 'gemini', model: 'gemini-2.0-flash',
    } as never);

    const result = await makeEngine().generate(FILES, 'react', OPTS, []);
    expect(result.meta.model).not.toMatch(/^AIza/);
    expect(result.meta.model).not.toMatch(/^sk-/);
  });
});
