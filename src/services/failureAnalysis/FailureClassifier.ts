// ─── FailureClassifier (Phase 4 M8) ──────────────────────────────────────────
// Pure deterministic classification — no AI, no network calls.
// AI analysis only runs AFTER classification.

import type {
  ClassificationResult, ExecutionSummary, Evidence, FailureCategory,
} from './FailureAnalysisTypes';

interface Rule {
  category:   FailureCategory;
  confidence: number;
  subCategory?: string;
  test: (errorText: string, summary: ExecutionSummary, evidence: Evidence[]) => string | null;
}

// Returns a signal string when matched, null when not applicable.
const RULES: Rule[] = [
  {
    category: 'crash',
    confidence: 0.95,
    test: (err) => /crash|anr|application not responding|force.?close|fatal exception|process.*died|killedprocess/i.test(err)
      ? 'App crash or ANR detected in error output'
      : null,
  },
  {
    category: 'permission',
    confidence: 0.9,
    test: (err) => /permission.*denied|access.*denied|not.*permitted|securityexception|requires.*permission/i.test(err)
      ? 'Permission denied exception in error output'
      : null,
  },
  {
    category: 'visual_regression',
    confidence: 0.92,
    test: (_err, _sum, evidence) => evidence.some(e => e.type === 'visual_diff' && (e.metadata as Record<string, unknown>)?.['hasDiff'])
      ? 'Visual diff evidence recorded for this run'
      : null,
  },
  {
    category: 'assertion_failure',
    confidence: 0.95,
    test: (_err, summary) => summary.assertions.some(a => a.status === 'FAIL' || a.status === 'ERROR')
      ? `${summary.assertions.filter(a => a.status === 'FAIL' || a.status === 'ERROR').length} assertion(s) failed`
      : null,
  },
  {
    category: 'locator_failure',
    confidence: 0.9,
    test: (err) => /no such element|unable to locate|element.*not found|nosuchelement|cannot find element|element.*does not exist/i.test(err)
      ? 'Element not found error in step output'
      : null,
  },
  {
    category: 'timeout',
    confidence: 0.9,
    test: (err) => /timeout|timed.?out|wait.*expired|implicit.?wait|explicit.?wait|element.*not.*ready/i.test(err)
      ? 'Timeout or wait expiry in error output'
      : null,
  },
  {
    category: 'navigation',
    confidence: 0.8,
    test: (err) => /navigation.*fail|activity.*not.*found|wrong.*activity|expected.*screen|screen.*not.*found|back.*stack/i.test(err)
      ? 'Navigation or screen transition error detected'
      : null,
  },
  {
    category: 'api_failure',
    confidence: 0.85,
    test: (err) => /http.*error|network.*error|connection.*refused|api.*fail|status.*[45]\d\d|socket.*timeout|dns.*fail/i.test(err)
      ? 'HTTP/network error in error output'
      : null,
  },
];

export class FailureClassifier {
  classify(
    summary:  ExecutionSummary,
    evidence: Evidence[],
  ): ClassificationResult {
    const errorText = [
      summary.error ?? '',
      ...summary.failedStepList.map(s => s.error ?? ''),
      ...summary.assertions.filter(a => a.status === 'FAIL' || a.status === 'ERROR').map(a => a.message + ' ' + (a.error ?? '')),
    ].join(' ');

    const signals: string[] = [];

    // Evaluate all rules, collect matches
    const matches: Array<{ rule: Rule; signal: string }> = [];
    for (const rule of RULES) {
      const signal = rule.test(errorText, summary, evidence);
      if (signal) matches.push({ rule, signal });
    }

    if (matches.length === 0) {
      return {
        category:   'unknown',
        confidence: 0.4,
        signals:    ['No specific pattern matched'],
      };
    }

    // Pick highest-confidence match; collect all signals as context
    const best = matches.reduce((a, b) => b.rule.confidence > a.rule.confidence ? b : a);
    for (const m of matches) signals.push(m.signal);

    return {
      category:    best.rule.category,
      confidence:  best.rule.confidence,
      signals,
      subCategory: best.rule.subCategory,
    };
  }
}
