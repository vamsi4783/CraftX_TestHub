/** Shared test utilities for AI Connector Platform tests. */

import type { AIRequest, AIResponse, AIStreamChunk } from '../../../ai/types/AITypes';
import type { Fetcher }                              from '../../../ai/providers/shared/streamUtils';

// ─── Request factory ──────────────────────────────────────────────────────────

export function makeRequest(overrides?: Partial<AIRequest>): AIRequest {
  return {
    requestId:  overrides?.requestId  ?? 'req-test',
    task:       overrides?.task       ?? 'generic',
    userPrompt: overrides?.userPrompt ?? 'Hello, world',
    ...overrides,
  };
}

// ─── ReadableStream builder ───────────────────────────────────────────────────

export function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (i >= chunks.length) ctrl.close();
      else ctrl.enqueue(enc.encode(chunks[i++]));
    },
  });
}

// ─── Mock fetch builders ──────────────────────────────────────────────────────

/** Returns a Fetcher that always responds with the given status + JSON body. */
export function mockJsonFetch(status: number, body: unknown, headers: Record<string, string> = {}): Fetcher {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: new Headers({ 'Content-Type': 'application/json', ...headers }),
    });
}

/** Returns a Fetcher that always responds with the given status + stream body. */
export function mockStreamFetch(status: number, body: ReadableStream<Uint8Array>): Fetcher {
  return async () =>
    new Response(body, {
      status,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    });
}

/** Returns a Fetcher that always throws a network error. */
export function mockNetworkErrorFetch(): Fetcher {
  return async () => { throw new Error('fetch failed'); };
}

/** Returns a Fetcher that responds after a delay. */
export function mockDelayedFetch(delayMs: number, status: number, body: unknown): Fetcher {
  return async () => {
    await new Promise(r => setTimeout(r, delayMs));
    return new Response(JSON.stringify(body), { status });
  };
}

/**
 * Returns a Fetcher sequence — each call returns the next response in the list.
 * When the list is exhausted it wraps around.
 */
export function mockSequentialFetch(responses: Array<{ status: number; body: unknown }>): Fetcher {
  let index = 0;
  return async () => {
    const r = responses[index % responses.length];
    index++;
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });
  };
}

// ─── Stream collector ─────────────────────────────────────────────────────────

export async function collectStream<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of iterable) result.push(item);
  return result;
}

// ─── Gemini response builders ─────────────────────────────────────────────────

export function geminiSuccessResponse(text: string, inputTokens = 5, outputTokens = 10) {
  return {
    candidates: [{
      content: { parts: [{ text }], role: 'model' },
      finishReason: 'STOP',
    }],
    usageMetadata: {
      promptTokenCount:     inputTokens,
      candidatesTokenCount: outputTokens,
      totalTokenCount:      inputTokens + outputTokens,
    },
  };
}

export function geminiErrorResponse(code: number, message: string) {
  return { error: { code, message, status: 'ERROR' } };
}

export function geminiSSEChunk(text: string, done = false): string {
  const resp = {
    candidates: [{
      content: { parts: [{ text }], role: 'model' },
      finishReason: done ? 'STOP' : '',
    }],
    ...(done ? { usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 } } : {}),
  };
  return `data: ${JSON.stringify(resp)}\n`;
}

// ─── Ollama response builders ─────────────────────────────────────────────────

export function ollamaSuccessResponse(content: string, model = 'llama3.2') {
  return {
    model,
    message:           { role: 'assistant', content },
    done:              true,
    eval_count:        20,
    prompt_eval_count: 10,
  };
}

export function ollamaStreamChunk(content: string, done = false) {
  return JSON.stringify({
    model:   'llama3.2',
    message: { role: 'assistant', content },
    done,
    ...(done ? { eval_count: 20, prompt_eval_count: 10 } : {}),
  }) + '\n';
}

// ─── OpenAI response builders ─────────────────────────────────────────────────

export function oaiSuccessResponse(content: string, model = 'gpt-4o') {
  return {
    id:      'chatcmpl-test',
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop', index: 0 }],
    usage:   { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
    model,
  };
}

export function oaiStreamChunk(delta: string, done = false): string {
  const payload = {
    id:      'chatcmpl-test',
    choices: [{ delta: { content: delta }, finish_reason: done ? 'stop' : null, index: 0 }],
  };
  return `data: ${JSON.stringify(payload)}\n`;
}

// ─── Suppresses response ──────────────────────────────────────────────────────

export function isValidAIResponse(resp: AIResponse): boolean {
  return (
    typeof resp.requestId === 'string' &&
    typeof resp.text      === 'string' &&
    typeof resp.latency   === 'number' &&
    typeof resp.provider  === 'string' &&
    typeof resp.connector === 'string' &&
    typeof resp.model     === 'string' &&
    typeof resp.reasoningAvailable === 'boolean'
  );
}

export function isValidStreamChunk(chunk: AIStreamChunk): boolean {
  return (
    typeof chunk.requestId === 'string' &&
    typeof chunk.delta     === 'string' &&
    typeof chunk.done      === 'boolean'
  );
}
