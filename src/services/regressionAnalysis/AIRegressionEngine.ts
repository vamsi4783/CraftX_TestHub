// ─── AIRegressionEngine (Phase 4 M9) ─────────────────────────────────────────
// Calls the regression-analysis Supabase Edge Function.
// AI augments deterministic results — never replaces them.

import { supabase }          from '@/lib/supabase';
import type { AIRegressionInsight, RegressionAIContext } from './RegressionAnalysisTypes';

const FUNCTION_NAME = 'regression-analysis';

interface RawInsight {
  likelyRegressionAreas?:   string[];
  untestedScenarios?:       string[];
  suggestedRegressionSuite?: string[];
  highRiskModules?:         string[];
  developerExplanation?:    string;
  qaExplanation?:           string;
  confidence?:              number;
}

export class AIRegressionEngine {
  async analyze(context: RegressionAIContext): Promise<AIRegressionInsight> {
    const prompt = this._buildPrompt(context);

    const { data, error } = await supabase.functions.invoke<{
      insight:        RawInsight;
      model:          string;
      generationTime: number;
    }>(FUNCTION_NAME, { body: { prompt, fromVersion: context.fromVersion, toVersion: context.toVersion } });

    if (error) throw new Error(`AIRegressionEngine: ${error.message}`);
    if (!data)  throw new Error('AIRegressionEngine: no data from edge function');

    const raw = data.insight ?? {};
    return {
      likelyRegressionAreas:   Array.isArray(raw.likelyRegressionAreas)  ? raw.likelyRegressionAreas.map(String)  : [],
      untestedScenarios:       Array.isArray(raw.untestedScenarios)       ? raw.untestedScenarios.map(String)       : [],
      suggestedRegressionSuite: Array.isArray(raw.suggestedRegressionSuite) ? raw.suggestedRegressionSuite.map(String) : [],
      highRiskModules:         Array.isArray(raw.highRiskModules)         ? raw.highRiskModules.map(String)         : [],
      developerExplanation:    String(raw.developerExplanation ?? ''),
      qaExplanation:           String(raw.qaExplanation        ?? ''),
      confidence:              Math.max(0, Math.min(1, Number(raw.confidence ?? 0.6))),
      rawResponse:             JSON.stringify(raw),
    };
  }

  private _buildPrompt(ctx: RegressionAIContext): string {
    const impactSummary = ctx.impactedAreas.slice(0, 20).map(a =>
      `  ${a.type.toUpperCase()} "${a.name}" [${a.category}] risk=${Math.round(a.riskFactor * 100)}%`
    ).join('\n');

    const riskTop = ctx.riskScores.slice(0, 10).map(r =>
      `  ${r.tier.toUpperCase()} "${r.areaName}" score=${Math.round(r.score * 100)}% (change=${Math.round(r.factors.changeWeight * 100)}% failure=${Math.round(r.factors.failureRate * 100)}% coverage_gap=${Math.round(r.factors.coverageGap * 100)}%)`
    ).join('\n');

    const uncovered = ctx.coverageResults.filter(c => !c.covered).map(c => `  "${c.areaName}"`).join('\n');

    const commits = ctx.commitMessages.slice(0, 10).map(m => `  - ${m.slice(0, 120)}`).join('\n');

    return `You are an expert QA engineer performing regression impact analysis for a ${ctx.projectType} application.

## Version Change
From: ${ctx.fromVersion}
To:   ${ctx.toVersion}
Changed files: ${ctx.changedFiles.length} files

## Changed Files (sample)
${ctx.changedFiles.slice(0, 20).map(f => `  ${f}`).join('\n')}

## Commit Messages
${commits || '  (none provided)'}

## Impacted Areas (deterministic analysis)
${impactSummary || '  (none detected)'}

## Risk Scores (top 10, deterministic)
${riskTop || '  (none)'}

## Uncovered Areas
${uncovered || '  (all areas have test coverage)'}

---
Return ONLY valid JSON matching this exact schema:
{
  "likelyRegressionAreas": ["<area or module name>"],
  "untestedScenarios": ["<scenario description>"],
  "suggestedRegressionSuite": ["<test case name or description>"],
  "highRiskModules": ["<module name>"],
  "developerExplanation": "<technical explanation of regression risk>",
  "qaExplanation": "<non-technical explanation for QA>",
  "confidence": <0.0-1.0>
}`;
  }
}
