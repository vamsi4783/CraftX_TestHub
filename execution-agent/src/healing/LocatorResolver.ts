// ─── LocatorResolver (Phase 4 M7) ────────────────────────────────────────────
// Ranks candidate locators and attempts to verify each against the live driver.
// Returns the best match, confidence score, explanation, and ranked alternatives.

import type { IDriver }       from '../drivers/IDriver.js';
import type { ExecutionStep } from '../execution/ExecutionTypes.js';
import type {
  Locator,
  LocatorCandidate,
  HealingStrategyKind,
} from './HealingTypes.js';

export interface LocatorResolveResult {
  /** Best candidate that was verified to work, or highest-confidence candidate if none verified. */
  best?:         LocatorCandidate;
  /** Whether the best candidate was verified against the driver. */
  verified:      boolean;
  /** 0–1 confidence of the best candidate. */
  confidence:    number;
  /** Human-readable description of how the best was chosen. */
  explanation:   string;
  /** All remaining candidates in descending confidence order. */
  alternatives:  LocatorCandidate[];
}

/** How the locator is embedded in the step's automation config. */
const SELECTOR_FIELD = 'selector';

export class LocatorResolver {

  /**
   * Given a ranked list of candidates (from HealingStrategyRegistry.gatherCandidates),
   * try each in confidence order until one works on the live driver.
   *
   * If `skipVerification` is true (useful in tests), returns the top candidate
   * without issuing driver calls.
   */
  async resolve(
    candidates:        LocatorCandidate[],
    step:              ExecutionStep,
    driver:            IDriver,
    skipVerification?: boolean,
  ): Promise<LocatorResolveResult> {
    if (candidates.length === 0) {
      return {
        verified:    false,
        confidence:  0,
        explanation: 'No candidates available',
        alternatives: [],
      };
    }

    // If verification is disabled (test mode) return the best candidate immediately
    if (skipVerification) {
      const [best, ...rest] = candidates;
      return {
        best,
        verified:    false,
        confidence:  best.confidence,
        explanation: `Unverified (test mode): ${best.explanation}`,
        alternatives: rest,
      };
    }

    const tried: LocatorCandidate[]     = [];
    let   resolved: LocatorCandidate | undefined;

    for (const candidate of candidates) {
      const locator = candidate.locator;
      if (!locator.value || locator.strategy === 'unknown') {
        // "unknown" means the original selector is reused — skip explicit verification
        // (the retry coordinator will re-run the step which verifies implicitly)
        tried.push(candidate);
        if (!resolved) {
          resolved = candidate;
        }
        continue;
      }

      const verifiedLocator = await this._probe(driver, step, locator);
      if (verifiedLocator) {
        resolved = candidate;
        break;
      }
      tried.push(candidate);
    }

    const alternatives = candidates.filter(c => c !== resolved);

    if (!resolved) {
      return {
        verified:    false,
        confidence:  candidates[0].confidence,
        explanation: `No candidate verified after ${candidates.length} attempt(s)`,
        alternatives: candidates,
      };
    }

    return {
      best:          resolved,
      verified:      resolved.locator.strategy !== 'unknown',
      confidence:    resolved.confidence,
      explanation:   resolved.explanation,
      alternatives,
    };
  }

  /**
   * Build a patched ExecutionStep with the resolved locator injected.
   * The original step is never mutated.
   */
  buildPatchedStep(step: ExecutionStep, candidate: LocatorCandidate): ExecutionStep {
    return {
      ...step,
      action: {
        ...step.action,
        selector: candidate.locator.value,
        params: {
          ...(step.action.params ?? {}),
          _healing_strategy:   candidate.strategy,
          _original_selector:  step.action.selector,
          _healing_confidence: candidate.confidence,
        },
      },
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  /**
   * Issue a lightweight driver probe to check if the locator resolves.
   * Uses a 'find_element' action if the driver supports it; otherwise
   * falls back to the step's original action.
   */
  private async _probe(
    driver: IDriver,
    step:   ExecutionStep,
    locator: Locator,
  ): Promise<boolean> {
    try {
      const result = await driver.execute({
        action:   'find_element',
        selector: locator.value,
        params:   { locator_strategy: locator.strategy, timeout_ms: 2_000 },
      });
      return result.success;
    } catch {
      // Driver doesn't support find_element; attempt the real action as probe
      try {
        const result = await driver.execute({
          action:   step.action.action,
          selector: locator.value,
          params:   { timeout_ms: 2_000 },
        });
        return result.success;
      } catch {
        return false;
      }
    }
  }
}
