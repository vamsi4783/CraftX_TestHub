// ─── RecommendationEngine (Phase 4 M8) ────────────────────────────────────────
// Pure function: generates typed Recommendations from classification + AI output.
// NEVER modifies automation automatically — produces user-approvable suggestions only.

import type {
  ClassificationResult, AIAnalysisResult, ExecutionSummary, Recommendation,
} from './FailureAnalysisTypes';

const uuidv4 = () => crypto.randomUUID();

export class RecommendationEngine {
  generate(
    classification: ClassificationResult,
    aiAnalysis:     AIAnalysisResult | null,
    summary:        ExecutionSummary,
  ): Recommendation[] {
    const recs: Recommendation[] = [];

    // ── Deterministic recommendations per category ────────────────────────────
    switch (classification.category) {
      case 'assertion_failure': {
        const failedAssertions = summary.assertions.filter(a => a.status === 'FAIL' || a.status === 'ERROR');
        recs.push({
          id:                   uuidv4(),
          type:                 'fix_assertion',
          priority:             'high',
          title:                'Review failing assertions',
          description:          `${failedAssertions.length} assertion(s) failed. Verify expected values match the current application state. ` +
            (failedAssertions[0] ? `First failure: expected "${failedAssertions[0].expected}" but got "${failedAssertions[0].actual}".` : ''),
          actionable:           true,
          requiresUserApproval: true,
          metadata: { assertionCount: failedAssertions.length },
        });
        break;
      }

      case 'locator_failure': {
        const healingFailed = summary.healingAttempts.some(h => h.outcome === 'failed');
        const healingMissing = summary.healingAttempts.length === 0;
        recs.push({
          id:                   uuidv4(),
          type:                 'update_locator',
          priority:             'high',
          title:                'Update element locator',
          description:          'The automation could not find the target element. The locator may be outdated after a UI change. Review and update the selector in the test step.',
          actionable:           true,
          requiresUserApproval: true,
        });
        if (healingMissing || healingFailed) {
          recs.push({
            id:                   uuidv4(),
            type:                 'enable_healing',
            priority:             'medium',
            title:                'Enable self-healing for this test',
            description:          healingFailed
              ? 'Self-healing was attempted but could not resolve the locator. Consider using a more stable selector (resource-id, accessibility-id) alongside healing.'
              : 'Self-healing automation is not enabled for this run. Enabling it may automatically recover from this type of failure in future runs.',
            actionable:           true,
            requiresUserApproval: true,
          });
        }
        break;
      }

      case 'timeout': {
        recs.push({
          id:                   uuidv4(),
          type:                 'increase_timeout',
          priority:             'medium',
          title:                'Increase step timeout',
          description:          'A step waited longer than the configured timeout. Either the app is slow under current load, or the element never appears. Consider increasing the timeout or adding an explicit wait.',
          actionable:           true,
          requiresUserApproval: true,
        });
        break;
      }

      case 'crash': {
        recs.push({
          id:                   uuidv4(),
          type:                 'file_bug',
          priority:             'critical',
          title:                'File a crash bug report',
          description:          'The application crashed or stopped responding (ANR) during test execution. This is a product defect and should be filed immediately. Attach crash logs and screenshots from this run.',
          actionable:           true,
          requiresUserApproval: true,
        });
        break;
      }

      case 'navigation': {
        recs.push({
          id:                   uuidv4(),
          type:                 'review_navigation',
          priority:             'high',
          title:                'Review navigation flow',
          description:          'The test reached an unexpected screen or activity. Verify that the navigation path in the test steps matches the current app routing.',
          actionable:           true,
          requiresUserApproval: true,
        });
        break;
      }

      case 'permission': {
        recs.push({
          id:                   uuidv4(),
          type:                 'check_permissions',
          priority:             'high',
          title:                'Grant required permissions',
          description:          'The app was denied a permission it needs. Add permission-granting steps to the test setup (e.g., tap "Allow" on the OS dialog, or grant permissions via ADB before the run).',
          actionable:           true,
          requiresUserApproval: true,
        });
        break;
      }

      case 'visual_regression': {
        recs.push({
          id:                   uuidv4(),
          type:                 'update_baseline',
          priority:             'medium',
          title:                'Review visual diff and update baseline if intentional',
          description:          'Visual comparison detected pixel differences from the baseline. If this is an intentional UI change, accept and update the baseline. Otherwise, file a visual regression bug.',
          actionable:           true,
          requiresUserApproval: true,
        });
        break;
      }

      case 'api_failure': {
        recs.push({
          id:                   uuidv4(),
          type:                 'check_network',
          priority:             'high',
          title:                'Investigate network/API failure',
          description:          'A network request failed during the test. Check server availability, authentication tokens, and API endpoint URLs. Consider adding a connectivity pre-check to the test setup.',
          actionable:           true,
          requiresUserApproval: true,
        });
        break;
      }

      default: {
        recs.push({
          id:                   uuidv4(),
          type:                 'manual_review',
          priority:             'medium',
          title:                'Manual review required',
          description:          'The failure could not be automatically classified. Review the step history, error messages, and screenshots manually.',
          actionable:           true,
          requiresUserApproval: false,
        });
        break;
      }
    }

    // ── AI-informed recommendations (additive, never replace deterministic) ───
    if (aiAnalysis) {
      if (aiAnalysis.suggestedFix && aiAnalysis.confidence > 0.6) {
        recs.push({
          id:                   uuidv4(),
          type:                 'manual_review',
          priority:             aiAnalysis.confidence > 0.85 ? 'high' : 'medium',
          title:                'AI suggested fix',
          description:          aiAnalysis.suggestedFix,
          actionable:           true,
          requiresUserApproval: true,
          metadata: { aiConfidence: aiAnalysis.confidence, source: 'ai' },
        });
      }

      if (aiAnalysis.suggestedHealing && classification.category === 'locator_failure') {
        recs.push({
          id:                   uuidv4(),
          type:                 'enable_healing',
          priority:             'low',
          title:                'AI suggested healing strategy',
          description:          aiAnalysis.suggestedHealing,
          actionable:           true,
          requiresUserApproval: true,
          metadata: { source: 'ai' },
        });
      }

      if (aiAnalysis.regressionProbability > 0.8) {
        recs.push({
          id:                   uuidv4(),
          type:                 'file_bug',
          priority:             'medium',
          title:                'High regression risk detected',
          description:          `AI estimates ${Math.round(aiAnalysis.regressionProbability * 100)}% probability this is a regression. Review recent changes in the affected area.`,
          actionable:           true,
          requiresUserApproval: false,
          metadata: { regressionProbability: aiAnalysis.regressionProbability, source: 'ai' },
        });
      }
    }

    // Sort: critical → high → medium → low
    const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
    return recs.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]);
  }
}
