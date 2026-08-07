// ─── Visual Comparison Engine — Public API (Phase 4 M5) ───────────────────────
export { VisualComparisonEngine }         from './VisualComparisonEngine.js';
export { ImageComparator }                from './ImageComparator.js';
export { DiffGenerator }                  from './DiffGenerator.js';
export { FileSystemBaselineStore, InMemoryBaselineStore } from './BaselineStore.js';
export type { IBaselineStore }            from './BaselineStore.js';
export { VisualMatchAssertionHandler }    from './handlers/VisualMatchAssertionHandler.js';
export type {
  VisualComparisonMode,
  VisualComparisonMetrics,
  VisualComparisonOutput,
  VisualAssertionResult,
  VisualAssertionParams,
  BaselineMetadata,
  BoundingBox,
  IgnoreRegion,
}                                         from './VisualTypes.js';
