// ─── Suggestion Engine (Phase 4 M6) ───────────────────────────────────────────
// Deduplication, scoring, filtering of generated test suggestions.
// Pure transforms — no AI, no I/O.

import type { TestSuggestion, DuplicateCheckResult } from './types.js';

// ─── Token-based similarity (simple bag-of-words Jaccard) ────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2),
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;

  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── SuggestionEngine ─────────────────────────────────────────────────────────

export class SuggestionEngine {

  /**
   * Run duplicate detection against a list of existing test titles.
   * Returns a new array with `isDuplicate`, `duplicateOf`, `duplicateSimilarity`
   * set on each suggestion.
   *
   * @param threshold Similarity score above which a suggestion is a duplicate (default 0.6).
   */
  detectDuplicates(
    suggestions:    TestSuggestion[],
    existingTitles: string[],
    threshold = 0.6,
  ): TestSuggestion[] {
    return suggestions.map(s => {
      const result = this.checkDuplicate(s.draft.title, existingTitles, threshold);
      return { ...s, ...result };
    });
  }

  /**
   * Check a single title against existing titles.
   */
  checkDuplicate(
    candidateTitle: string,
    existingTitles: string[],
    threshold = 0.6,
  ): DuplicateCheckResult {
    let best      = 0;
    let bestTitle = '';

    for (const existing of existingTitles) {
      const sim = jaccardSimilarity(candidateTitle, existing);
      if (sim > best) { best = sim; bestTitle = existing; }
    }

    if (best >= threshold) {
      return { isDuplicate: true, duplicateOf: bestTitle, similarity: parseFloat(best.toFixed(3)) };
    }
    return { isDuplicate: false, similarity: parseFloat(best.toFixed(3)) };
  }

  /**
   * Cross-check generated suggestions against each other to avoid internal dupes.
   */
  deduplicateWithinBatch(suggestions: TestSuggestion[], threshold = 0.7): TestSuggestion[] {
    const seen:  string[] = [];
    const result: TestSuggestion[] = [];

    for (const s of suggestions) {
      const check = this.checkDuplicate(s.draft.title, seen, threshold);
      if (!check.isDuplicate) {
        seen.push(s.draft.title);
        result.push(s);
      }
    }

    return result;
  }

  /**
   * Sort suggestions by: non-duplicates first, then by confidence descending,
   * then by priority (critical > high > medium > low).
   */
  sort(suggestions: TestSuggestion[]): TestSuggestion[] {
    const PRI: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return [...suggestions].sort((a, b) => {
      if (a.isDuplicate !== b.isDuplicate) return a.isDuplicate ? 1 : -1;
      if (b.confidence !== a.confidence)   return b.confidence - a.confidence;
      return (PRI[b.draft.priority] ?? 0) - (PRI[a.draft.priority] ?? 0);
    });
  }

  /**
   * Filter suggestions by category.
   */
  filterByCategory(suggestions: TestSuggestion[], categories: string[]): TestSuggestion[] {
    if (categories.length === 0) return suggestions;
    return suggestions.filter(s => categories.includes(s.category));
  }

  /**
   * Apply the full pipeline: detect duplicates, deduplicate within batch, sort.
   */
  process(
    suggestions:    TestSuggestion[],
    existingTitles: string[],
    opts: { duplicateThreshold?: number; internalThreshold?: number } = {},
  ): TestSuggestion[] {
    let result = this.detectDuplicates(suggestions, existingTitles, opts.duplicateThreshold);
    result     = this.deduplicateWithinBatch(result, opts.internalThreshold);
    return this.sort(result);
  }
}
