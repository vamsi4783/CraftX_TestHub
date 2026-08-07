import type { AIRequest, AIResponse } from '../types/AITypes';

// ─── Cache interface ──────────────────────────────────────────────────────────

export interface IAICache {
  get(key: string): AIResponse | undefined;
  set(key: string, response: AIResponse, ttlMs?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
}

// ─── Cache key derivation ─────────────────────────────────────────────────────

export function buildCacheKey(request: AIRequest): string {
  return [
    request.task,
    request.systemPrompt ?? '',
    request.userPrompt,
    JSON.stringify(request.modelPreferences ?? {}),
  ].join('|');
}

// ─── No-op cache (default) ────────────────────────────────────────────────────

export class NoOpCache implements IAICache {
  get(_key: string): undefined { return undefined; }
  set(_key: string, _response: AIResponse, _ttlMs?: number): void {}
  has(_key: string): boolean { return false; }
  delete(_key: string): boolean { return false; }
  clear(): void {}
  size(): number { return 0; }
}

// ─── In-memory cache with TTL ─────────────────────────────────────────────────

interface CacheEntry {
  readonly response:  AIResponse;
  readonly expiresAt: number;
}

export class InMemoryAICache implements IAICache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly defaultTtlMs = 5 * 60 * 1000) {}

  get(key: string): AIResponse | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.response;
  }

  set(key: string, response: AIResponse, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { response, expiresAt: Date.now() + ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
