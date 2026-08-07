// ─── ContextBuilder (Phase 4 M8) ──────────────────────────────────────────────
// Builds the structured payload sent to AIAnalysisEngine.
// Keeps context under a token budget (~6000 chars) for efficiency.

import type {
  AnalysisContext, ClassificationResult, ExecutionSummary, Evidence, PreviousFailure,
} from './FailureAnalysisTypes';

const MAX_STEPS_IN_CONTEXT    = 15;
const MAX_ASSERTIONS_IN_CONTEXT = 10;
const MAX_ERROR_LENGTH         = 600;

export class ContextBuilder {
  build(
    summary:         ExecutionSummary,
    classification:  ClassificationResult,
    evidence:        Evidence[],
    previousFailures: PreviousFailure[],
  ): AnalysisContext {
    const trimmedSummary = this._trimSummary(summary);
    const trimmedEvidence = this._trimEvidence(evidence);

    return {
      runId:            summary.runId,
      testCaseName:     summary.testCaseName ?? 'Unknown test case',
      classification,
      summary:          trimmedSummary,
      evidence:         trimmedEvidence,
      previousFailures: previousFailures.slice(0, 5),
    };
  }

  buildPrompt(context: AnalysisContext): string {
    const { classification, summary, evidence, previousFailures } = context;

    const failedStepsSection = summary.failedStepList
      .slice(0, MAX_STEPS_IN_CONTEXT)
      .map(s =>
        `  Step ${s.stepNumber} [${s.action}]${s.selector ? ` selector="${s.selector}"` : ''}\n  Error: ${s.error?.slice(0, MAX_ERROR_LENGTH) ?? '(no error text)'}`,
      )
      .join('\n\n');

    const assertionsSection = summary.assertions
      .filter(a => a.status === 'FAIL' || a.status === 'ERROR')
      .slice(0, MAX_ASSERTIONS_IN_CONTEXT)
      .map(a =>
        `  [${a.assertionKind}] Expected: ${a.expected.slice(0, 200)} | Actual: ${a.actual.slice(0, 200)}\n  Message: ${a.message.slice(0, 300)}`,
      )
      .join('\n\n');

    const healingSection = summary.healingAttempts.length > 0
      ? summary.healingAttempts.map(h =>
          `  Step ${h.stepNumber}: outcome=${h.outcome}` +
          (h.strategyUsed ? ` strategy=${h.strategyUsed}` : '') +
          (h.originalLocator ? ` original="${h.originalLocator}"` : '') +
          (h.resolvedLocator ? ` resolved="${h.resolvedLocator}"` : ''),
        ).join('\n')
      : '  (no healing attempts)';

    const evidenceSection = evidence
      .filter(e => e.content)
      .slice(0, 5)
      .map(e => `  [${e.type}] Step ${e.stepNumber}: ${e.content?.slice(0, 300)}`)
      .join('\n');

    const previousSection = previousFailures.length > 0
      ? previousFailures.slice(0, 5).map(p =>
          `  ${p.createdAt.slice(0, 10)} category=${p.category} resolved=${p.resolved}`,
        ).join('\n')
      : '  (no previous failures found)';

    return `You are an expert QA/automation engineer performing failure analysis.

Analyze this test execution failure and return a JSON object with your findings.

## Test Case
Name: ${context.testCaseName}
Run ID: ${context.runId}

## Execution Summary
Status: ${summary.status}
Steps: ${summary.totalSteps} total, ${summary.passedSteps} passed, ${summary.failedSteps} failed
Duration: ${Math.round(summary.duration_ms / 1000)}s
Device: ${summary.deviceInfo ? `${summary.deviceInfo.platform} ${summary.deviceInfo.os_version ?? ''}` : 'unknown'}
Environment: ${summary.environment ?? 'unknown'}
Build: ${summary.buildVersion ?? 'unknown'}
${summary.error ? `Top-level error: ${summary.error.slice(0, MAX_ERROR_LENGTH)}` : ''}

## Deterministic Classification
Category: ${classification.category}
Confidence: ${Math.round(classification.confidence * 100)}%
Signals: ${classification.signals.join('; ')}

## Failed Steps
${failedStepsSection || '  (no failed steps)'}

## Failed Assertions
${assertionsSection || '  (no failed assertions)'}

## Healing Attempts
${healingSection}

## Evidence
${evidenceSection || '  (no textual evidence)'}

## Previous Failures (same test case)
${previousSection}

---

Return ONLY valid JSON matching this exact schema:
{
  "rootCause": "<1-3 sentences explaining WHY this failed>",
  "confidence": <0.0-1.0>,
  "evidenceSummary": "<2-4 sentences summarizing the key evidence>",
  "likelySourceFiles": ["<filename or module>"],
  "suggestedFix": "<specific, actionable fix for the developer>",
  "suggestedHealing": "<optional healing strategy recommendation or null>",
  "regressionProbability": <0.0-1.0>,
  "developerExplanation": "<technical explanation for the developer>",
  "qaExplanation": "<non-technical explanation for the QA engineer>"
}`;
  }

  private _trimSummary(summary: ExecutionSummary): ExecutionSummary {
    return {
      ...summary,
      steps:          summary.steps.slice(-MAX_STEPS_IN_CONTEXT),
      failedStepList: summary.failedStepList.slice(0, MAX_STEPS_IN_CONTEXT),
      assertions:     summary.assertions.slice(0, MAX_ASSERTIONS_IN_CONTEXT),
    };
  }

  private _trimEvidence(evidence: Evidence[]): Evidence[] {
    return evidence.slice(0, 10);
  }
}
