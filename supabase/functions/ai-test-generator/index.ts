// ─── Edge Function: ai-test-generator (Phase 4 M6) ────────────────────────────
// Deno / Supabase Edge Function — proxies AI test generation through Claude API.
// Keeps ANTHROPIC_API_KEY server-side.
//
// Deploy: supabase functions deploy ai-test-generator
// Env:    ANTHROPIC_API_KEY must be set in the Supabase dashboard.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL    = 'claude-sonnet-5-20251101';
const MAX_TOKENS = 8192;

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

    const body = await req.json() as {
      prompt:    string;
      sessionId: string;
      options?:  { maxSuggestions?: number };
    };

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
        system:     'You are an expert QA engineer. Return ONLY valid JSON as instructed.',
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
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string })  => c.text)
      .join('');

    // ── Parse JSON from Claude ─────────────────────────────────────────────────
    let parsed: { suggestions: unknown[] } = { suggestions: [] };
    try {
      const cleaned = rawText.trim()
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '');
      parsed = JSON.parse(cleaned);
    } catch {
      // Return empty rather than crashing
      parsed = { suggestions: [] };
    }

    return new Response(
      JSON.stringify({
        suggestions:     parsed.suggestions ?? [],
        model:           anthropicData.model ?? MODEL,
        generationTime:  Date.now() - t0,
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
