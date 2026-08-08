// ─── AIAnalysisEngine (Phase 4 M8) ────────────────────────────────────────────
// Routes through AIOrchestrationService (user-configured connectors) first.
// Falls back to the failure-analysis Supabase Edge Function when no connectors
// are configured or when the orchestrator fails.

import { supabase } from '@/lib/supabase';
import { aiOrchestrationService, parseJSONFromText } from '@/features/ai-connectors/aiOrchestrationService';
import { aiRuntimePolicy } from '@/features/ai-connectors/aiRuntimePolicy';
import type { AIAnalysisResult, AnalysisContext } from './FailureAnalysisTypes';
import { ContextBuilder } from './ContextBuilder';

const FUNCTION_NAME = 'failure-analysis';

interface RawAIResponse {
  rootCause?:              string;
  confidence?:             number;
  evidenceSummary?:        string;
  likelySourceFiles?:      string[];
  suggestedFix?:           string;
  suggestedHealing?:       string | null;
  regressionProbability?:  number;
  developerExplanation?:   string;
  qaExplanation?:          string;
}

export class AIAnalysisEngine {
  private readonly contextBuilder = new ContextBuilder();

  async analyze(context: AnalysisContext): Promise<AIAnalysisResult> {
    const prompt = this.contextBuilder.buildPrompt(context);

    let raw: RawAIResponse = {};
    let orchestratorSucceeded = false;

    // Path 1: user-configured connector via AIOrchestrationService
    if (aiOrchestrationService.hasUsableConnectors()) {
      try {
        const response = await aiOrchestrationService.execute({
          requestId:    context.runId,
          task:         'failure_analysis',
          systemPrompt: 'You are an expert QA failure analysis AI. Return ONLY valid JSON as instructed. No explanation, no markdown, no code fences.',
          userPrompt:   prompt,
        });
        raw = parseJSONFromText(response.text) as RawAIResponse;
        orchestratorSucceeded = true;
      } catch {
        // Orchestrator failed — fall through to edge function
      }
    }

    // Path 2: Supabase Edge Function — only when the user has explicitly enabled it.
    // Disabled by default: calling this function uses a TestHub-owned Anthropic key.
    if (!orchestratorSucceeded) {
      if (!aiRuntimePolicy.isEdgeFunctionEnabled()) {
        throw new Error(
          'AI unavailable: no usable connectors configured and edge-function fallback is disabled. ' +
          'Configure a connector or enable the edge-function fallback in AI Settings.',
        );
      }
      const { data, error } = await supabase.functions.invoke<{
        analysis:       RawAIResponse;
        model:          string;
        generationTime: number;
      }>(FUNCTION_NAME, {
        body: { prompt, runId: context.runId },
      });

      if (error) throw new Error(`AIAnalysisEngine: edge function error — ${error.message}`);
      if (!data)  throw new Error('AIAnalysisEngine: no data returned from edge function');

      raw = data.analysis ?? {};
    }

    return {
      rootCause:             String(raw.rootCause              ?? 'Root cause could not be determined.'),
      confidence:            clamp(Number(raw.confidence       ?? 0.5)),
      evidenceSummary:       String(raw.evidenceSummary        ?? ''),
      likelySourceFiles:     Array.isArray(raw.likelySourceFiles) ? raw.likelySourceFiles.map(String) : [],
      suggestedFix:          String(raw.suggestedFix           ?? 'Review the failing step manually.'),
      suggestedHealing:      raw.suggestedHealing ? String(raw.suggestedHealing) : undefined,
      regressionProbability: clamp(Number(raw.regressionProbability ?? 0.5)),
      developerExplanation:  String(raw.developerExplanation   ?? ''),
      qaExplanation:         String(raw.qaExplanation          ?? ''),
      rawResponse:           JSON.stringify(raw),
    };
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, isNaN(n) ? 0.5 : n));
}
