// ─── SuggestionEngine unit tests (Phase 4 M6) ─────────────────────────────────
import { describe, it, expect } from 'vitest';
import { SuggestionEngine, jaccardSimilarity } from '@/services/aiTestGenerator/SuggestionEngine';
import type { TestSuggestion } from '@/services/aiTestGenerator/types';

// ─── jaccardSimilarity ─────────────────────────────────────────────────────────
describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaccardSimilarity('login user with email', 'login user with email')).toBe(1);
  });

  it('returns 0.0 for completely different strings', () => {
    expect(jaccardSimilarity('alpha beta gamma', 'delta epsilon zeta')).toBe(0);
  });

  it('returns value between 0 and 1 for partial overlap', () => {
    const sim = jaccardSimilarity('login user with email', 'login user with password');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('is symmetric', () => {
    const a = 'test login form validation';
    const b = 'validate login form inputs';
    expect(jaccardSimilarity(a, b)).toBeCloseTo(jaccardSimilarity(b, a));
  });

  it('handles empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(1);
    expect(jaccardSimilarity('hello', '')).toBe(0);
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
function makeSuggestion(title: string, category: TestSuggestion['category'] = 'smoke'): TestSuggestion {
  return {
    id:           `id-${title}`,
    category,
    reason:       'test reason',
    sourceFiles:  [],
    confidence:   0.8,
    coverageArea: 'Test',
    isDuplicate:  false,
    status:       'pending',
    draft: {
      title,
      description:         null,
      priority:            'medium',
      preconditions:       null,
      tags:                [],
      is_automation_ready: false,
      estimated_minutes:   10,
      steps:               [],
    },
  };
}

// ─── SuggestionEngine ──────────────────────────────────────────────────────────
describe('SuggestionEngine', () => {
  const engine = new SuggestionEngine();

  // ── Duplicate detection ────────────────────────────────────────────────────
  describe('detectDuplicates', () => {
    it('marks suggestion as duplicate when title is highly similar to existing', () => {
      const suggestions = [makeSuggestion('Test login with valid email and password')];
      const existing    = ['Test login with valid email and password'];
      const result = engine.detectDuplicates(suggestions, existing, 0.6);
      expect(result[0].isDuplicate).toBe(true);
    });

    it('does NOT mark distinct tests as duplicates', () => {
      const suggestions = [makeSuggestion('Verify password reset flow on mobile')];
      const existing    = ['Test search functionality with empty query'];
      const result = engine.detectDuplicates(suggestions, existing, 0.6);
      expect(result[0].isDuplicate).toBe(false);
    });

    it('populates duplicateOf when duplicate found', () => {
      const suggestions = [makeSuggestion('Login with correct credentials')];
      const existing    = ['Login with correct credentials'];
      const result = engine.detectDuplicates(suggestions, existing, 0.6);
      expect(result[0].duplicateOf).toBeTruthy();
    });
  });

  // ── Within-batch deduplication ─────────────────────────────────────────────
  describe('deduplicateWithinBatch', () => {
    it('keeps first occurrence of near-identical suggestions', () => {
      const suggestions = [
        makeSuggestion('Verify login form with valid credentials'),
        makeSuggestion('Verify login form with valid credentials'),
      ];
      const result = engine.deduplicateWithinBatch(suggestions, 0.9);
      expect(result.length).toBe(1);
    });

    it('keeps distinct suggestions', () => {
      const suggestions = [
        makeSuggestion('Test login happy path'),
        makeSuggestion('Test logout flow and session expiry'),
      ];
      const result = engine.deduplicateWithinBatch(suggestions, 0.7);
      expect(result.length).toBe(2);
    });
  });

  // ── Sorting ────────────────────────────────────────────────────────────────
  describe('sort', () => {
    it('orders higher confidence before lower confidence', () => {
      const lo = { ...makeSuggestion('low',  'smoke'), confidence: 0.3 };
      const hi = { ...makeSuggestion('high', 'regression'), confidence: 0.9 };
      const sorted = engine.sort([lo, hi]);
      expect(sorted[0].confidence).toBeGreaterThan(sorted[1].confidence);
    });

    it('orders non-duplicates before duplicates at same confidence', () => {
      const dup = { ...makeSuggestion('dup', 'smoke'), confidence: 0.9, isDuplicate: true };
      const fresh = { ...makeSuggestion('fresh', 'smoke'), confidence: 0.9, isDuplicate: false };
      const sorted = engine.sort([dup, fresh]);
      expect(sorted[0].isDuplicate).toBe(false);
    });

    it('orders critical priority before low priority at same confidence', () => {
      const lo = { ...makeSuggestion('low-pri', 'smoke'), confidence: 0.8, draft: { ...makeSuggestion('x').draft, priority: 'low' as const } };
      const hi = { ...makeSuggestion('crit', 'smoke'), confidence: 0.8, draft: { ...makeSuggestion('x').draft, priority: 'critical' as const } };
      const sorted = engine.sort([lo, hi]);
      expect(sorted[0].draft.priority).toBe('critical');
    });
  });

  // ── filterByCategory ───────────────────────────────────────────────────────
  describe('filterByCategory', () => {
    it('returns only matching categories', () => {
      const suggestions = [
        makeSuggestion('a', 'smoke'),
        makeSuggestion('b', 'regression'),
        makeSuggestion('c', 'smoke'),
      ];
      const result = engine.filterByCategory(suggestions, ['smoke']);
      expect(result.every(s => s.category === 'smoke')).toBe(true);
      expect(result.length).toBe(2);
    });

    it('returns all if categories is empty', () => {
      const suggestions = [makeSuggestion('a', 'smoke'), makeSuggestion('b', 'regression')];
      expect(engine.filterByCategory(suggestions, []).length).toBe(2);
    });
  });

  // ── process ────────────────────────────────────────────────────────────────
  describe('process', () => {
    it('runs duplicate check, dedup within batch, sort, and filter', () => {
      const suggestions = [
        makeSuggestion('smoke test login',      'smoke'),
        makeSuggestion('smoke test login',      'smoke'),   // duplicate within batch
        makeSuggestion('boundary test input',   'boundary'),
      ];
      const result = engine.process(suggestions, [], {});
      const smokeCount = result.filter(s => s.category === 'smoke').length;
      expect(smokeCount).toBe(1);  // within-batch dedup removed duplicate
      expect(result.some(s => s.category === 'boundary')).toBe(true);
    });
  });
});
