// ─── Edge Function: regression-analysis (Phase 4 M9) ──────────────────────────
// Deno / Supabase Edge Function — AI regression impact analysis via Claude.
// Deploy: supabase functions deploy regression-analysis

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL      = 'claude-sonnet-5-20251101';
const MAX_TOKENS = 4096;

interface RegressionInsight {
  likelyRegressionAreas?:   string[];
  untestedScenarios?:       string[];
  suggestedRegressionSuite?: string[];
  highRiskModules?:         string[];
  developerExplanation?:    string;
  qaExplanation?:           string;
  confidence?:              number;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const body = await req.json() as { prompt: string; fromVersion?: string; toVersion?: string };
    if (!body.prompt) {
      return new Response(JSON.stringify({ error: 'prompt is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const t0 = Date.now();
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: MAX_TOKENS,
        system: 'You are an expert QA and software engineer performing regression risk analysis. Return ONLY valid JSON as instructed.',
        messages: [{ role: 'user', content: body.prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(JSON.stringify({ error: `Anthropic API ${anthropicRes.status}: ${errText}` }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const anthropicData = await anthropicRes.json() as {
      content: Array<{ type: string; text: string }>; model: string;
    };

    const rawText = anthropicData.content.filter(c => c.type === 'text').map(c => c.text).join('');

    let insight: RegressionInsight = {};
    try {
      const cleaned = rawText.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      insight = JSON.parse(cleaned);
    } catch {
      insight = {
        likelyRegressionAreas:   [],
        untestedScenarios:       [],
        suggestedRegressionSuite: [],
        highRiskModules:         [],
        developerExplanation:    rawText.slice(0, 500),
        qaExplanation:           'AI could not generate a structured response.',
        confidence:              0.3,
      };
    }

    return new Response(
      JSON.stringify({ insight, model: anthropicData.model ?? MODEL, generationTime: Date.now() - t0 }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
