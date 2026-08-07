// ─── AIAnalysisEngine (Phase 4 M8) ────────────────────────────────────────────
// Calls the failure-analysis Supabase Edge Function (which holds ANTHROPIC_API_KEY).
// Parses structured JSON response back to AIAnalysisResult.

import { supabase } from '@/lib/supabase';
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

    const { data, error } = await supabase.functions.invoke<{
      analysis:       RawAIResponse;
      model:          string;
      generationTime: number;
    }>(FUNCTION_NAME, {
      body: { prompt, runId: context.runId },
    });

    if (error) throw new Error(`AIAnalysisEngine: edge function error — ${error.message}`);
    if (!data)  throw new Error('AIAnalysisEngine: no data returned from edge function');

    const raw = data.analysis ?? {};

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
