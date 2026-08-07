// ─── Edge Function: failure-analysis (Phase 4 M8) ─────────────────────────────
// Deno / Supabase Edge Function — proxies failure analysis through Claude API.
// Keeps ANTHROPIC_API_KEY server-side.
//
// Deploy: supabase functions deploy failure-analysis
// Env:    ANTHROPIC_API_KEY must be set in the Supabase dashboard.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL      = 'claude-sonnet-5';
const MAX_TOKENS = 4096;

interface RequestBody {
  prompt: string;
  runId:  string;
}

interface AnalysisResponse {
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json() as RequestBody;

    if (!body.prompt) {
      return new Response(
        JSON.stringify({ error: 'prompt is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ── Call Claude API ────────────────────────────────────────────────────────
    const t0 = Date.now();
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system:     'You are an expert QA and automation engineer performing failure analysis. Return ONLY valid JSON as instructed — no markdown, no explanation outside the JSON object.',
        messages:   [{ role: 'user', content: body.prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API error ${anthropicRes.status}: ${errText}` }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const anthropicData = await anthropicRes.json() as {
      content: Array<{ type: string; text: string }>;
      model:   string;
    };

    const rawText = anthropicData.content
      .filter((c) => c.type === 'text')
      .map((c)  => c.text)
      .join('');

    // ── Parse structured JSON from Claude ─────────────────────────────────────
    let analysis: AnalysisResponse = {};
    try {
      const cleaned = rawText.trim()
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '');
      analysis = JSON.parse(cleaned);
    } catch {
      // Return a graceful fallback rather than crashing
      analysis = {
        rootCause:            'AI analysis could not parse a structured response.',
        confidence:           0.3,
        evidenceSummary:      rawText.slice(0, 500),
        likelySourceFiles:    [],
        suggestedFix:         'Review the failing steps manually.',
        regressionProbability: 0.5,
        developerExplanation: rawText.slice(0, 500),
        qaExplanation:        'The AI was unable to generate a structured explanation.',
      };
    }

    return new Response(
      JSON.stringify({
        analysis,
        model:          anthropicData.model ?? MODEL,
        generationTime: Date.now() - t0,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
