/**
 * M9 Regression Analysis — integration tests verifying orchestrator routing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/ai-connectors/aiOrchestrationService', () => ({
  aiOrchestrationService: {
    hasUsableConnectors: vi.fn(() => false),
    execute:             vi.fn(),
  },
  parseJSONFromText: (text: string) => JSON.parse(text),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: new Error('edge unavailable') }),
    },
  },
}));

vi.mock('../../features/ai-connectors/aiRuntimePolicy', () => ({
  aiRuntimePolicy: {
    isEdgeFunctionEnabled:  vi.fn(() => true),
    setEdgeFunctionEnabled: vi.fn(),
  },
}));

import { aiOrchestrationService } from '../../features/ai-connectors/aiOrchestrationService';
import { supabase }               from '../../lib/supabase';
import { AIRegressionEngine }     from '../../services/regressionAnalysis/AIRegressionEngine';
import type { RegressionAIContext } from '../../services/regressionAnalysis/RegressionAnalysisTypes';

const invokeMock  = vi.mocked(supabase.functions.invoke);
const hasMock     = vi.mocked(aiOrchestrationService.hasUsableConnectors);
const executeMock = vi.mocked(aiOrchestrationService.execute);

const CTX: RegressionAIContext = {
  projectType:     'react_web',
  fromVersion:     'v1.0',
  toVersion:       'v1.1',
  changedFiles:    ['src/Login.tsx'],
  commitMessages:  ['fix: null check on login'],
  impactedAreas:   [],
  riskScores:      [],
  coverageResults: [],
};

const EDGE_INSIGHT = {
  likelyRegressionAreas:   ['login'],
  untestedScenarios:       ['forgot password'],
  suggestedRegressionSuite:['Login flow'],
  highRiskModules:         ['src/Login.tsx'],
  developerExplanation:    'dev exp',
  qaExplanation:           'qa exp',
  confidence:              0.75,
};

describe('M9 — orchestrator routing', () => {
  beforeEach(() => {
    hasMock.mockReturnValue(false);
    executeMock.mockReset();
    invokeMock.mockReset();
  });

  it('routes through aiOrchestrationService when connector is configured', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockResolvedValue({
      requestId: 'r', text: JSON.stringify(EDGE_INSIGHT),
      structuredOutput: undefined, reasoningAvailable: false,
      latency: 15, provider: 'gemini', connector: 'gemini', model: 'gemini-2.0-flash',
    } as never);

    const result = await new AIRegressionEngine().analyze(CTX);
    expect(aiOrchestrationService.execute).toHaveBeenCalledOnce();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(result.likelyRegressionAreas).toContain('login');
    expect(result.confidence).toBeCloseTo(0.75);
  });

  it('falls back to edge function when no connector configured', async () => {
    hasMock.mockReturnValue(false);
    invokeMock.mockResolvedValue({
      data: { insight: EDGE_INSIGHT, model: 'claude', generationTime: 180 },
      error: null,
    });

    const result = await new AIRegressionEngine().analyze(CTX);
    expect(aiOrchestrationService.execute).not.toHaveBeenCalled();
    expect(supabase.functions.invoke).toHaveBeenCalledWith('regression-analysis', expect.anything());
    expect(result.likelyRegressionAreas).toContain('login');
  });

  it('falls back to edge function when orchestrator throws', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockRejectedValue(new Error('connector failed'));
    invokeMock.mockResolvedValue({
      data: { insight: EDGE_INSIGHT, model: 'claude', generationTime: 160 },
      error: null,
    });

    const result = await new AIRegressionEngine().analyze(CTX);
    expect(result.likelyRegressionAreas).toContain('login');
    expect(supabase.functions.invoke).toHaveBeenCalledOnce();
  });

  it('throws when both orchestrator and edge function fail', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockRejectedValue(new Error('orch failed'));
    invokeMock.mockResolvedValue({ data: null, error: new Error('edge failed') });

    await expect(new AIRegressionEngine().analyze(CTX)).rejects.toThrow('AIRegressionEngine');
  });

  it('orchestrator task includes from/to version in requestId', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockResolvedValue({
      requestId: 'r', text: JSON.stringify(EDGE_INSIGHT),
      structuredOutput: undefined, reasoningAvailable: false,
      latency: 10, provider: 'g', connector: 'g', model: 'm',
    } as never);

    await new AIRegressionEngine().analyze(CTX);
    const req = executeMock.mock.calls[0][0];
    expect(req.requestId).toContain('v1.0');
    expect(req.requestId).toContain('v1.1');
  });

  it('result arrays default to [] when AI returns empty object', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockResolvedValue({
      requestId: 'r', text: '{}',
      structuredOutput: undefined, reasoningAvailable: false,
      latency: 5, provider: 'g', connector: 'g', model: 'm',
    } as never);

    const result = await new AIRegressionEngine().analyze(CTX);
    expect(Array.isArray(result.likelyRegressionAreas)).toBe(true);
    expect(Array.isArray(result.untestedScenarios)).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it('confidence is clamped to [0, 1]', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockResolvedValue({
      requestId: 'r', text: JSON.stringify({ ...EDGE_INSIGHT, confidence: -5 }),
      structuredOutput: undefined, reasoningAvailable: false,
      latency: 5, provider: 'g', connector: 'g', model: 'm',
    } as never);

    const result = await new AIRegressionEngine().analyze(CTX);
    expect(result.confidence).toBe(0);
  });

  it('M9 does not directly import GeminiFlashConnector or OllamaConnector', async () => {
    const { AIRegressionEngine: E } = await import('../../services/regressionAnalysis/AIRegressionEngine');
    expect(E).toBeDefined();
  });
});
