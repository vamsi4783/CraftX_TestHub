// ─── HealingStrategyRegistry (Phase 4 M7) ────────────────────────────────────
// Maintains an ordered list of IHealingStrategy instances.
// Strategies are selected by canHandle() and ordered by priority.

import type { IDriver }             from '../drivers/IDriver.js';
import type { ExecutionStep }       from '../execution/ExecutionTypes.js';
import type { HealingStrategyKind, LocatorCandidate } from './HealingTypes.js';
import type { IHealingStrategy }   from './strategies/IHealingStrategy.js';

import { ElementIdChangedStrategy }         from './strategies/ElementIdChangedStrategy.js';
import { ButtonTextChangedStrategy }        from './strategies/ButtonTextChangedStrategy.js';
import { RelativePositionShiftStrategy }    from './strategies/RelativePositionShiftStrategy.js';
import { XPathFallbackStrategy }            from './strategies/XPathFallbackStrategy.js';
import { CssSelectorFallbackStrategy }      from './strategies/CssSelectorFallbackStrategy.js';
import { AccessibilityLabelFallbackStrategy } from './strategies/AccessibilityLabelFallbackStrategy.js';
import { NearbyElementSimilarityStrategy }  from './strategies/NearbyElementSimilarityStrategy.js';
import { RetryWithWaitStrategy }            from './strategies/RetryWithWaitStrategy.js';
import { ScrollThenRetryStrategy }          from './strategies/ScrollThenRetryStrategy.js';
import { VisibilityRetryStrategy }          from './strategies/VisibilityRetryStrategy.js';

export class HealingStrategyRegistry {
  private readonly strategies: IHealingStrategy[] = [];

  constructor(strategies?: IHealingStrategy[]) {
    if (strategies) {
      this.strategies.push(...strategies);
    } else {
      this._registerDefaults();
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  register(strategy: IHealingStrategy): void {
    this.strategies.push(strategy);
    this._sortByPriority();
  }

  has(kind: HealingStrategyKind): boolean {
    return this.strategies.some(s => s.kind === kind);
  }

  get count(): number { return this.strategies.length; }

  /**
   * Return strategies that declare they can handle the given failure,
   * ordered by priority (lowest priority number = tried first).
   */
  select(step: ExecutionStep, error: string): IHealingStrategy[] {
    return this.strategies
      .filter(s => s.canHandle(step, error))
      .sort((a, b) => a.capability.priority - b.capability.priority);
  }

  /**
   * Run all applicable strategies and aggregate their candidates,
   * sorted by confidence descending.
   */
  async gatherCandidates(
    step:   ExecutionStep,
    driver: IDriver,
    error:  string,
  ): Promise<LocatorCandidate[]> {
    const applicable = this.select(step, error);
    const all: LocatorCandidate[] = [];

    for (const strategy of applicable) {
      try {
        const candidates = await strategy.getCandidates(step, driver, error);
        all.push(...candidates);
      } catch (_err) {
        // Strategy threw — skip it, let others run
      }
    }

    // Sort by confidence descending; deduplicate by locator value
    const seen = new Set<string>();
    return all
      .sort((a, b) => b.confidence - a.confidence)
      .filter(c => {
        const key = `${c.locator.strategy}:${c.locator.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  private _registerDefaults(): void {
    this.strategies.push(
      new ElementIdChangedStrategy(),
      new ButtonTextChangedStrategy(),
      new RelativePositionShiftStrategy(),
      new XPathFallbackStrategy(),
      new CssSelectorFallbackStrategy(),
      new AccessibilityLabelFallbackStrategy(),
      new NearbyElementSimilarityStrategy(),
      new RetryWithWaitStrategy(),
      new ScrollThenRetryStrategy(),
      new VisibilityRetryStrategy(),
    );
    this._sortByPriority();
  }

  private _sortByPriority(): void {
    this.strategies.sort((a, b) => a.capability.priority - b.capability.priority);
  }
}
