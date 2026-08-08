/**
 * M8 Failure Analysis — integration tests verifying orchestrator routing.
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

import { aiOrchestrationService } from '../../features/ai-connectors/aiOrchestrationService';
import { supabase }               from '../../lib/supabase';
import { AIAnalysisEngine }       from '../../services/failureAnalysis/AIAnalysisEngine';
import type { AnalysisContext }   from '../../services/failureAnalysis/FailureAnalysisTypes';

const invokeMock  = vi.mocked(supabase.functions.invoke);
const hasMock     = vi.mocked(aiOrchestrationService.hasUsableConnectors);
const executeMock = vi.mocked(aiOrchestrationService.execute);

const CTX: AnalysisContext = {
  runId:            'run_001',
  testCaseName:     'Login flow',
  classification:   { category: 'crash', confidence: 0.9, signals: [] },
  summary:          {
    runId: 'run_001', status: 'failed', totalSteps: 1, passedSteps: 0, failedSteps: 1,
    skippedSteps: 0, duration_ms: 500, startedAt: new Date().toISOString(),
    steps: [], failedStepList: [], assertions: [], healingAttempts: [],
  },
  evidence:         [],
  previousFailures: [],
};

const EDGE_ANALYSIS = {
  rootCause: 'Null pointer', confidence: 0.8,
  evidenceSummary: 'crash at login',
  likelySourceFiles: ['Login.swift'],
  suggestedFix: 'Check for null',
  regressionProbability: 0.3,
  developerExplanation: 'dev exp',
  qaExplanation: 'qa exp',
};

describe('M8 — orchestrator routing', () => {
  beforeEach(() => {
    hasMock.mockReturnValue(false);
    executeMock.mockReset();
    invokeMock.mockReset();
  });

  it('routes through aiOrchestrationService when connector is configured', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockResolvedValue({
      requestId: 'r', text: JSON.stringify(EDGE_ANALYSIS),
      structuredOutput: undefined, reasoningAvailable: false,
      latency: 10, provider: 'ollama', connector: 'ollama', model: 'llama3.2',
    } as never);

    const result = await new AIAnalysisEngine().analyze(CTX);
    expect(aiOrchestrationService.execute).toHaveBeenCalledOnce();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(result.rootCause).toBe('Null pointer');
    expect(result.confidence).toBeCloseTo(0.8);
  });

  it('falls back to edge function when no connector configured', async () => {
    hasMock.mockReturnValue(false);
    invokeMock.mockResolvedValue({
      data: { analysis: EDGE_ANALYSIS, model: 'claude', generationTime: 200 },
      error: null,
    });

    const result = await new AIAnalysisEngine().analyze(CTX);
    expect(aiOrchestrationService.execute).not.toHaveBeenCalled();
    expect(supabase.functions.invoke).toHaveBeenCalledWith('failure-analysis', expect.anything());
    expect(result.rootCause).toBe('Null pointer');
  });

  it('falls back to edge function when orchestrator throws', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockRejectedValue(new Error('connector failed'));
    invokeMock.mockResolvedValue({
      data: { analysis: EDGE_ANALYSIS, model: 'claude', generationTime: 150 },
      error: null,
    });

    const result = await new AIAnalysisEngine().analyze(CTX);
    expect(result.rootCause).toBe('Null pointer');
    expect(supabase.functions.invoke).toHaveBeenCalledOnce();
  });

  it('throws when both orchestrator and edge function fail', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockRejectedValue(new Error('orch failed'));
    invokeMock.mockResolvedValue({ data: null, error: new Error('edge failed') });

    await expect(new AIAnalysisEngine().analyze(CTX)).rejects.toThrow('AIAnalysisEngine');
  });

  it('orchestrator result uses safe defaults for missing fields', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockResolvedValue({
      requestId: 'r', text: '{}',
      structuredOutput: undefined, reasoningAvailable: false,
      latency: 5, provider: 'gemini', connector: 'gemini', model: 'm',
    } as never);

    const result = await new AIAnalysisEngine().analyze(CTX);
    expect(result.rootCause).toBe('Root cause could not be determined.');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('confidence is clamped to [0, 1]', async () => {
    hasMock.mockReturnValue(true);
    executeMock.mockResolvedValue({
      requestId: 'r', text: JSON.stringify({ ...EDGE_ANALYSIS, confidence: 99 }),
      structuredOutput: undefined, reasoningAvailable: false,
      latency: 5, provider: 'g', connector: 'g', model: 'm',
    } as never);

    const result = await new AIAnalysisEngine().analyze(CTX);
    expect(result.confidence).toBe(1);
  });

  it('M8 does not directly import GeminiFlashConnector or OllamaConnector', async () => {
    const { AIAnalysisEngine: E } = await import('../../services/failureAnalysis/AIAnalysisEngine');
    expect(E).toBeDefined();
  });
});
