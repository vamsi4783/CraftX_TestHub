// ─── Self-Healing Engine — Public API (Phase 4 M7) ────────────────────────────
export { SelfHealingEngine }            from './SelfHealingEngine.js';
export { HealingStrategyRegistry }      from './HealingStrategyRegistry.js';
export { LocatorResolver }              from './LocatorResolver.js';
export { ExecutionRetryCoordinator }    from './ExecutionRetryCoordinator.js';
export type { SelfHealingEngineOptions } from './SelfHealingEngine.js';
export type { LocatorResolveResult }    from './LocatorResolver.js';
export type { RetryOutcome }            from './ExecutionRetryCoordinator.js';
export type {
  Locator,
  LocatorStrategy,
  LocatorCandidate,
  HealingCapability,
  HealingStrategyKind,
  HealingResult,
  HealingEvent,
  HealingOutcome,
  ISelfHealingPlugin,
} from './HealingTypes.js';

// ─── Strategies ───────────────────────────────────────────────────────────────
export { ElementIdChangedStrategy }           from './strategies/ElementIdChangedStrategy.js';
export { ButtonTextChangedStrategy }          from './strategies/ButtonTextChangedStrategy.js';
export { RelativePositionShiftStrategy }      from './strategies/RelativePositionShiftStrategy.js';
export { XPathFallbackStrategy }              from './strategies/XPathFallbackStrategy.js';
export { CssSelectorFallbackStrategy }        from './strategies/CssSelectorFallbackStrategy.js';
export { AccessibilityLabelFallbackStrategy } from './strategies/AccessibilityLabelFallbackStrategy.js';
export { NearbyElementSimilarityStrategy }    from './strategies/NearbyElementSimilarityStrategy.js';
export { RetryWithWaitStrategy }              from './strategies/RetryWithWaitStrategy.js';
export { ScrollThenRetryStrategy }            from './strategies/ScrollThenRetryStrategy.js';
export { VisibilityRetryStrategy }            from './strategies/VisibilityRetryStrategy.js';
