// ─── SelfHealingEngine (Phase 4 M7) ──────────────────────────────────────────
// Orchestrates: strategy selection → candidate ranking → locator resolution →
// retry → evidence capture → healing event recording.
//
// No AI. Deterministic heuristics only.
// Safety: NEVER modifies stored automation_config. Healing is per-execution only.

import type { IDriver }            from '../drivers/IDriver.js';
import type { ExecutionStep }      from '../execution/ExecutionTypes.js';
import type { ExecutionContext }   from '../execution/ExecutionContext.js';
import type { StepExecutor }      from '../execution/StepExecutor.js';
import type {
  HealingResult,
  HealingEvent,
  ISelfHealingPlugin,
  LocatorCandidate,
} from './HealingTypes.js';
import { HealingStrategyRegistry }  from './HealingStrategyRegistry.js';
import { LocatorResolver }          from './LocatorResolver.js';
import { ExecutionRetryCoordinator } from './ExecutionRetryCoordinator.js';
import { StructuredLogger }          from '../logging/StructuredLogger.js';

// Browser-compatible UUID helper
const randomId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export interface SelfHealingEngineOptions {
  registry?:         HealingStrategyRegistry;
  /** 0–1. Candidates below this threshold are not used for retry. Default: 0.3 */
  minConfidence?:    number;
  /** Max candidates to try per healing attempt. Default: 5 */
  maxCandidates?:    number;
  /** Skip driver verification probes (useful in tests). Default: false */
  skipVerification?: boolean;
}

export class SelfHealingEngine implements ISelfHealingPlugin {
  private readonly logger   = new StructuredLogger('SelfHealingEngine');
  private readonly registry: HealingStrategyRegistry;
  private readonly resolver: LocatorResolver;
  private readonly retryCoordinator?: ExecutionRetryCoordinator;
  private readonly minConfidence:   number;
  private readonly maxCandidates:   number;
  private readonly skipVerification: boolean;

  readonly events: HealingEvent[] = [];

  constructor(
    stepExecutor?: StepExecutor,
    options:       SelfHealingEngineOptions = {},
  ) {
    this.registry         = options.registry         ?? new HealingStrategyRegistry();
    this.resolver         = new LocatorResolver();
    this.minConfidence    = options.minConfidence    ?? 0.3;
    this.maxCandidates    = options.maxCandidates    ?? 5;
    this.skipVerification = options.skipVerification ?? false;

    if (stepExecutor) {
      this.retryCoordinator = new ExecutionRetryCoordinator(stepExecutor);
    }
  }

  // ─── ISelfHealingPlugin ────────────────────────────────────────────────────

  async tryHeal(
    step:      ExecutionStep,
    driver:    IDriver,
    error:     string,
    runId:     string,
    sessionId: string,
  ): Promise<HealingResult> {
    const attemptedAt = new Date().toISOString();
    let screenshotBefore: Buffer | undefined;

    // ── 1. Capture "before" screenshot ────────────────────────────────────────
    try {
      const ss = await driver.execute({ action: 'screenshot' });
      if (ss.screenshot) screenshotBefore = ss.screenshot;
    } catch { /* swallow — evidence is best-effort */ }

    // ── 2. Gather candidates from all applicable strategies ───────────────────
    const rawCandidates = await this.registry.gatherCandidates(step, driver, error);
    const candidates    = rawCandidates
      .filter(c => c.confidence >= this.minConfidence)
      .slice(0, this.maxCandidates);

    if (candidates.length === 0) {
      const result: HealingResult = {
        outcome:        'not_applicable',
        retryCount:     0,
        attemptedAt,
        originalError:  error,
        alternatives:   [],
        screenshotBefore,
      };
      this._recordEvent(result, step, runId);
      return result;
    }

    // ── 3. Resolve best candidate ─────────────────────────────────────────────
    const resolved = await this.resolver.resolve(
      candidates, step, driver, this.skipVerification,
    );

    this.logger.info('healing_candidates_resolved', {
      step_id:    step.stepId,
      candidates: candidates.length,
      best:       resolved.best?.locator.value,
      confidence: resolved.confidence,
    });

    // ── 4. Retry the step with the patched locator ────────────────────────────
    if (!resolved.best) {
      const result: HealingResult = {
        outcome:         'failed',
        retryCount:      0,
        attemptedAt,
        originalError:   error,
        originalLocator: { strategy: 'unknown', value: step.action.selector ?? '' },
        alternatives:    resolved.alternatives,
        screenshotBefore,
        confidence:      0,
        explanation:     resolved.explanation,
      };
      this._recordEvent(result, step, runId);
      return result;
    }

    const patchedStep = this.resolver.buildPatchedStep(step, resolved.best);
    let retrySuccess  = false;
    let screenshotAfter: Buffer | undefined;

    if (this.retryCoordinator) {
      // Build a minimal ExecutionContext for the retry
      const ctx: ExecutionContext = {
        executionId:      runId,
        sessionId,
        projectId:        '',
        organizationId:   '',
        agentId:          'self-healing',
        correlationId:    sessionId,
        currentStep:      step.stepNumber,
        totalSteps:       step.stepNumber,
        cancellationToken: { isCancelled: false },
        logger:           this.logger,
        metrics:          { step_started: () => {}, step_finished: () => {} } as never,
      };

      const outcome = await this.retryCoordinator.execute(patchedStep, driver, ctx);
      retrySuccess  = outcome.success;
      if (outcome.screenshot) screenshotAfter = outcome.screenshot;

      // Capture screenshot after healing if not returned by the step
      if (!screenshotAfter) {
        try {
          const ss = await driver.execute({ action: 'screenshot' });
          if (ss.screenshot) screenshotAfter = ss.screenshot;
        } catch { /* swallow */ }
      }
    } else {
      // No coordinator (e.g. test mode) — treat resolved best as successful
      retrySuccess = resolved.verified || resolved.best.locator.strategy !== 'unknown';
    }

    const healingResult: HealingResult = {
      outcome:          retrySuccess ? 'healed' : 'failed',
      strategyUsed:     resolved.best.strategy,
      originalLocator:  { strategy: 'unknown', value: step.action.selector ?? '' },
      resolvedLocator:  resolved.best.locator,
      confidence:       resolved.confidence,
      explanation:      resolved.explanation,
      retryCount:       1,
      attemptedAt,
      originalError:    error,
      alternatives:     resolved.alternatives,
      screenshotBefore,
      screenshotAfter,
    };

    this._recordEvent(healingResult, step, runId);
    this.logger.info('healing_attempt_complete', {
      step_id: step.stepId,
      outcome: healingResult.outcome,
      strategy: healingResult.strategyUsed,
    });

    return healingResult;
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  private _recordEvent(result: HealingResult, step: ExecutionStep, runId: string): void {
    this.events.push({
      id:         randomId(),
      runId,
      stepId:     step.stepId,
      stepNumber: step.stepNumber,
      result,
      reviewed:   false,
      createdAt:  new Date().toISOString(),
    });
  }
}
