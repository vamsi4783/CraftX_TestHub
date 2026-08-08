/** Shared HTTP + stream parsing utilities for production connectors. */

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

// ─── Line reader ──────────────────────────────────────────────────────────────

export async function* readLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (t) yield t;
      }
    }
    if (buffer.trim()) yield buffer.trim();
  } finally {
    reader.releaseLock();
  }
}

// ─── SSE parser (OpenAI / Gemini) ─────────────────────────────────────────────

/**
 * Yields the raw JSON string from each `data: {...}` line.
 * Stops (without yielding) on `data: [DONE]`.
 */
export async function* parseSSELines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  for await (const line of readLines(body)) {
    if (line.startsWith('data: ')) {
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') return;
      yield payload;
    }
  }
}

// ─── NDJSON parser (Ollama) ───────────────────────────────────────────────────

/**
 * Yields each NDJSON line as a parsed object.
 */
export async function* parseNDJSON<T>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<T> {
  for await (const line of readLines(body)) {
    try {
      yield JSON.parse(line) as T;
    } catch {
      // skip malformed lines
    }
  }
}

// ─── Timeout + cancellation ───────────────────────────────────────────────────

/**
 * Returns a new AbortController that aborts after `timeoutMs`.
 * If `externalSignal` is provided, aborting it also aborts the controller.
 */
export function makeTimeoutController(
  timeoutMs:      number,
  externalSignal?: AbortSignal,
): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return { controller, clear: () => clearTimeout(timer) };
}

// ─── Error helpers ─────────────────────────────────────────────────────────────

export async function extractErrorMessage(resp: Response): Promise<string> {
  try {
    const body = await resp.json() as Record<string, unknown>;
    const msg  = (body['error'] as Record<string, unknown>)?.['message']
              ?? body['message']
              ?? body['detail'];
    if (typeof msg === 'string') return msg;
  } catch { /* ignore */ }
  return `HTTP ${resp.status}`;
}
