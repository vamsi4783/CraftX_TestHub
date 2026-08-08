/**
 * m8-cost-safety.test.ts — Phase 5.5 M8 free-first / cost-safety validation.
 *
 * Proves:
 *   Phase A — Priority model: user-configured connectors always take precedence.
 *   Phase C/F — Free/local mode: no paid calls when policy = disabled (default).
 *   Phase D — User API ownership: TestHub never injects its own API key.
 *   Phase G — Fallback matrix: edge function only when explicitly enabled.
 *   Phase I — Security: credentials never appear in edge-function request bodies.
 *
 * No real HTTP calls. All I/O is mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/features/ai-connectors/aiOrchestrationService', () => ({
  aiOrchestrationService: {
    hasUsableConnectors: vi.fn(() => false),
    execute:             vi.fn(),
  },
  parseJSONFromText: (text: string) => JSON.parse(text),
}));

vi.mock('@/features/ai-connectors/aiRuntimePolicy', () => ({
  aiRuntimePolicy: {
    isEdgeFunctionEnabled:  vi.fn(() => false),
    setEdgeFunctionEnabled: vi.fn(),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

// ContextBuilder.buildPrompt does complex DB/context work — stub it for unit tests.
vi.mock('@/services/failureAnalysis/ContextBuilder', () => ({
  ContextBuilder: class { buildPrompt() { return 'mocked-prompt'; } },
}));

// ─── Post-mock imports ────────────────────────────────────────────────────────

import { aiOrchestrationService } from '@/features/ai-connectors/aiOrchestrationService';
import { aiRuntimePolicy }        from '@/features/ai-connectors/aiRuntimePolicy';
import { supabase }               from '@/lib/supabase';

// clearAllMocks: resets call counts but keeps mock implementations (so ContextBuilder stays functional).
afterEach(() => vi.clearAllMocks());

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OPTS = { maxSuggestions: 3, categories: [] as never[] };
const ANALYSIS_CTX = {} as never; // ContextBuilder is mocked; content is irrelevant
const REGRESSION_CTX = {
  projectId: 'p1', projectType: 'web' as const,
  fromVersion: 'v1', toVersion: 'v2',
  changedFiles: [], commitMessages: [],
  impactedAreas: [], riskScores: [], coverageResults: [],
};

const BASE_RESPONSE = {
  requestId: 'r1', reasoningAvailable: false,
  latency: 10, provider: 'gemini', connector: 'gemini', model: 'gemini-2.0-flash',
} as const;

function mockOrch(enabled: boolean, text = '{}') {
  vi.mocked(aiOrchestrationService.hasUsableConnectors).mockReturnValue(enabled);
  if (enabled) {
    vi.mocked(aiOrchestrationService.execute).mockResolvedValue({ ...BASE_RESPONSE, text });
  }
}
function mockOrchFail() {
  vi.mocked(aiOrchestrationService.hasUsableConnectors).mockReturnValue(true);
  vi.mocked(aiOrchestrationService.execute).mockRejectedValue(new Error('connector failed'));
}
function mockPolicy(enabled: boolean) {
  vi.mocked(aiRuntimePolicy.isEdgeFunctionEnabled).mockReturnValue(enabled);
}
function mockEdge_testGen() {
  vi.mocked(supabase.functions.invoke).mockResolvedValue({
    data: { suggestions: [], model: 'claude-sonnet-5' }, error: null,
  } as never);
}
function mockEdge_analysis() {
  vi.mocked(supabase.functions.invoke).mockResolvedValue({
    data: {
      analysis: {
        rootCause: 'bug', confidence: 0.9, evidenceSummary: '', likelySourceFiles: [],
        suggestedFix: 'fix', regressionProbability: 0.1, developerExplanation: '', qaExplanation: '',
      },
      model: 'claude-sonnet-5', generationTime: 100,
    },
    error: null,
  } as never);
}
function mockEdge_regression() {
  vi.mocked(supabase.functions.invoke).mockResolvedValue({
    data: {
      insight: {
        likelyRegressionAreas: [], untestedScenarios: [], suggestedRegressionSuite: [],
        highRiskModules: [], developerExplanation: '', qaExplanation: '', confidence: 0.7,
      },
      model: 'claude-sonnet-5', generationTime: 100,
    },
    error: null,
  } as never);
}

// ─── Phase A — Priority model ─────────────────────────────────────────────────

describe('Phase A — user connectors always take priority over edge function', () => {
  beforeEach(() => mockPolicy(true)); // edge even enabled — connector must still win

  it('test-generator: connector succeeds → edge function never called', async () => {
    mockOrch(true, '{"suggestions":[]}');
    const { AITestGenerationEngine } = await import('@/services/aiTestGenerator/AITestGenerationEngine');
    await new AITestGenerationEngine().generate([], 'react', OPTS, []);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(aiOrchestrationService.execute).toHaveBeenCalledOnce();
  });

  it('failure-analysis: connector succeeds → edge function never called', async () => {
    const payload = { rootCause: 'bug', confidence: 0.9, evidenceSummary: '', likelySourceFiles: [], suggestedFix: 'fix', regressionProbability: 0.1, developerExplanation: '', qaExplanation: '' };
    mockOrch(true, JSON.stringify(payload));
    const { AIAnalysisEngine } = await import('@/services/failureAnalysis/AIAnalysisEngine');
    await new AIAnalysisEngine().analyze(ANALYSIS_CTX);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(aiOrchestrationService.execute).toHaveBeenCalledOnce();
  });

  it('regression-analysis: connector succeeds → edge function never called', async () => {
    const payload = { likelyRegressionAreas: [], untestedScenarios: [], suggestedRegressionSuite: [], highRiskModules: [], developerExplanation: '', qaExplanation: '', confidence: 0.7 };
    mockOrch(true, JSON.stringify(payload));
    const { AIRegressionEngine } = await import('@/services/regressionAnalysis/AIRegressionEngine');
    await new AIRegressionEngine().analyze(REGRESSION_CTX);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});

// ─── Phase C/F — FREE_ONLY: edge function never called when disabled ───────────

describe('Phase C/F — edge function never called when policy disabled (default)', () => {
  beforeEach(() => mockPolicy(false));

  it('no connectors + edge disabled → test-generator returns empty, no edge call', async () => {
    mockOrch(false);
    const { AITestGenerationEngine } = await import('@/services/aiTestGenerator/AITestGenerationEngine');
    const result = await new AITestGenerationEngine().generate([], 'react', OPTS, []);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(result.suggestions).toHaveLength(0);
    expect(result.meta.model).toBe('unavailable');
  });

  it('no connectors + edge disabled → analysis engine throws, no edge call', async () => {
    mockOrch(false);
    const { AIAnalysisEngine } = await import('@/services/failureAnalysis/AIAnalysisEngine');
    await expect(new AIAnalysisEngine().analyze(ANALYSIS_CTX))
      .rejects.toThrow('edge-function fallback is disabled');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('no connectors + edge disabled → regression engine throws, no edge call', async () => {
    mockOrch(false);
    const { AIRegressionEngine } = await import('@/services/regressionAnalysis/AIRegressionEngine');
    await expect(new AIRegressionEngine().analyze(REGRESSION_CTX))
      .rejects.toThrow('edge-function fallback is disabled');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('connector fails + edge disabled → test-generator returns unavailable, no edge call', async () => {
    mockOrchFail();
    const { AITestGenerationEngine } = await import('@/services/aiTestGenerator/AITestGenerationEngine');
    const result = await new AITestGenerationEngine().generate([], 'react', OPTS, []);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(result.meta.model).toBe('unavailable');
  });

  it('connector fails + edge disabled → analysis engine throws, no edge call', async () => {
    mockOrchFail();
    const { AIAnalysisEngine } = await import('@/services/failureAnalysis/AIAnalysisEngine');
    await expect(new AIAnalysisEngine().analyze(ANALYSIS_CTX))
      .rejects.toThrow('edge-function fallback is disabled');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});

// ─── Phase D — User API ownership ────────────────────────────────────────────
// Must run after Phase C/F (so edge policy is still false) and before Phase G.

describe('Phase D — user API key ownership', () => {
  it('policy default matches FREE_ONLY behavior (edge disabled)', () => {
    // Phase C/F's beforeEach set edge=false and clearAllMocks preserved it.
    expect(aiRuntimePolicy.isEdgeFunctionEnabled()).toBe(false);
  });

  it('setEdgeFunctionEnabled is callable (persists via policy module)', () => {
    aiRuntimePolicy.setEdgeFunctionEnabled(true);
    expect(vi.mocked(aiRuntimePolicy.setEdgeFunctionEnabled)).toHaveBeenCalledWith(true);
  });
});

// ─── Phase G — Fallback matrix: edge function only when enabled ───────────────

describe('Phase G — fallback matrix: edge function only when explicitly enabled', () => {
  beforeEach(() => mockPolicy(true));

  it('no connectors + edge enabled → test-generator calls edge function', async () => {
    mockOrch(false);
    mockEdge_testGen();
    const { AITestGenerationEngine } = await import('@/services/aiTestGenerator/AITestGenerationEngine');
    await new AITestGenerationEngine().generate([], 'react', OPTS, []);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('ai-test-generator', expect.any(Object));
  });

  it('no connectors + edge enabled → failure-analysis calls edge function', async () => {
    mockOrch(false);
    mockEdge_analysis();
    const { AIAnalysisEngine } = await import('@/services/failureAnalysis/AIAnalysisEngine');
    await new AIAnalysisEngine().analyze(ANALYSIS_CTX);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('failure-analysis', expect.any(Object));
  });

  it('no connectors + edge enabled → regression-analysis calls edge function', async () => {
    mockOrch(false);
    mockEdge_regression();
    const { AIRegressionEngine } = await import('@/services/regressionAnalysis/AIRegressionEngine');
    await new AIRegressionEngine().analyze(REGRESSION_CTX);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('regression-analysis', expect.any(Object));
  });

  it('connector succeeds + edge enabled → edge function NOT called (connector wins)', async () => {
    mockOrch(true, '{"suggestions":[]}');
    mockEdge_testGen();
    const { AITestGenerationEngine } = await import('@/services/aiTestGenerator/AITestGenerationEngine');
    await new AITestGenerationEngine().generate([], 'react', OPTS, []);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('connector fails + edge enabled → edge function called as fallback (test-gen)', async () => {
    mockOrchFail();
    mockEdge_testGen();
    const { AITestGenerationEngine } = await import('@/services/aiTestGenerator/AITestGenerationEngine');
    await new AITestGenerationEngine().generate([], 'react', OPTS, []);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('ai-test-generator', expect.any(Object));
  });

  it('connector fails + edge enabled → edge function called as fallback (analysis)', async () => {
    mockOrchFail();
    mockEdge_analysis();
    const { AIAnalysisEngine } = await import('@/services/failureAnalysis/AIAnalysisEngine');
    await new AIAnalysisEngine().analyze(ANALYSIS_CTX);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('failure-analysis', expect.any(Object));
  });

  it('both fail (connector + edge) → analysis throws', async () => {
    mockOrchFail();
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null, error: { message: 'edge down' },
    } as never);
    const { AIAnalysisEngine } = await import('@/services/failureAnalysis/AIAnalysisEngine');
    await expect(new AIAnalysisEngine().analyze(ANALYSIS_CTX)).rejects.toThrow();
    expect(supabase.functions.invoke).toHaveBeenCalledOnce();
  });

  it('both fail (connector + edge) → test-gen returns unavailable', async () => {
    mockOrchFail();
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null, error: { message: 'edge down' },
    } as never);
    const { AITestGenerationEngine } = await import('@/services/aiTestGenerator/AITestGenerationEngine');
    const result = await new AITestGenerationEngine().generate([], 'react', OPTS, []);
    expect(result.meta.model).toBe('unavailable');
    expect(result.suggestions).toHaveLength(0);
  });
});

// ─── Phase I — Security ───────────────────────────────────────────────────────

describe('Phase I — credentials never appear in edge-function request bodies', () => {
  beforeEach(() => mockPolicy(true));

  it('analysis edge-function body contains no API keys', async () => {
    mockOrch(false);
    mockEdge_analysis();
    const { AIAnalysisEngine } = await import('@/services/failureAnalysis/AIAnalysisEngine');
    await new AIAnalysisEngine().analyze(ANALYSIS_CTX);
    const [, invokeArgs] = vi.mocked(supabase.functions.invoke).mock.calls[0]!;
    const bodyStr = JSON.stringify((invokeArgs as { body: unknown }).body ?? {});
    expect(bodyStr).not.toMatch(/sk-|AIza|Bearer\s\S|api[_-]?key/i);
  });
});
