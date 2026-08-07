// ─── Visual Comparison Engine (Phase 4 M5) ────────────────────────────────────
// Orchestrates: BaselineStore → ImageComparator → DiffGenerator → evidence pack.
// Does NOT redesign AssertionEngine, AutonomousRunner, DriverHost, or EvidenceManager.

import { PNG }                   from 'pngjs';
import { StructuredLogger }      from '../logging/StructuredLogger.js';
import { ImageComparator }       from './ImageComparator.js';
import { DiffGenerator }         from './DiffGenerator.js';
import type { IBaselineStore }   from './BaselineStore.js';
import type {
  VisualAssertionParams,
  VisualAssertionResult,
  VisualComparisonMode,
  IgnoreRegion,
} from './VisualTypes.js';
import type { AssertionEvidence } from '../assertions/AssertionTypes.js';

// ─── VisualComparisonEngine ───────────────────────────────────────────────────

export class VisualComparisonEngine {
  private readonly logger      = new StructuredLogger('VisualComparisonEngine');
  private readonly comparator  = new ImageComparator();
  private readonly diffGen     = new DiffGenerator();

  constructor(private readonly store: IBaselineStore) {}

  /**
   * Evaluate a visual assertion.
   *
   * @param currentBuf PNG buffer of the current screenshot.
   * @param params     VisualAssertionParams from the automation step.
   * @param stepId     Step identifier — used as default baseline key and evidence tag.
   * @param startedAt  Timestamp when evaluation started (ISO 8601).
   */
  async evaluate(
    currentBuf: Buffer,
    params:     VisualAssertionParams,
    stepId:     string,
    startedAt:  string,
  ): Promise<VisualAssertionResult> {
    const t0         = Date.now();
    const baselineKey = params.baseline_id ?? stepId;

    // ── Capture-baseline mode ─────────────────────────────────────────────────
    if (params.capture_baseline) {
      const dims = this._readDims(currentBuf);
      await this.store.save(baselineKey, currentBuf, {
        key:        baselineKey,
        capturedAt: startedAt,
        width:      dims.width,
        height:     dims.height,
        sizeBytes:  currentBuf.byteLength,
        driverKind: 'unknown',
      });
      this.logger.info('baseline_captured', { key: baselineKey });
      return {
        assertionKind: 'assert_visual_match',
        status:        'PASS',
        expected:      'baseline captured',
        actual:        `${dims.width}x${dims.height} px`,
        message:       `Baseline captured (${dims.width}×${dims.height}) for key "${baselineKey}".`,
        duration_ms:   Date.now() - t0,
        baselineKey,
        evidenceCurrent: this._makeEvidence('screenshot', currentBuf, stepId, startedAt),
      };
    }

    // ── No baseline yet ───────────────────────────────────────────────────────
    if (!(await this.store.exists(baselineKey))) {
      return {
        assertionKind: 'assert_visual_match',
        status:        'ERROR',
        expected:      'baseline image',
        actual:        'no baseline found',
        message:       `No baseline for key "${baselineKey}". ` +
                       'Set capture_baseline=true on the first run to create one.',
        duration_ms:   Date.now() - t0,
        error:         `Baseline not found: ${baselineKey}`,
        baselineKey,
      };
    }

    // ── Load baseline ─────────────────────────────────────────────────────────
    let baselineBuf: Buffer;
    try {
      baselineBuf = await this.store.load(baselineKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        assertionKind: 'assert_visual_match',
        status:        'ERROR',
        expected:      'baseline loaded',
        actual:        msg,
        message:       `Failed to load baseline "${baselineKey}": ${msg}`,
        duration_ms:   Date.now() - t0,
        error:         msg,
        baselineKey,
      };
    }

    // ── Compare ───────────────────────────────────────────────────────────────
    const mode          = this._resolveMode(params);
    const tolerance     = params.tolerance    ?? (mode === 'exact' ? 0 : 10);
    const threshold     = params.threshold    ?? 0;
    const ignoreRegions = this._resolveIgnoreRegions(params);

    let raw;
    try {
      raw = this.comparator.compare(baselineBuf, currentBuf, {
        mode, tolerance, threshold, ignoreRegions,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        assertionKind: 'assert_visual_match',
        status:        'ERROR',
        expected:      'comparison succeeded',
        actual:        msg,
        message:       `Image comparison error: ${msg}`,
        duration_ms:   Date.now() - t0,
        error:         msg,
        baselineKey,
      };
    }

    // ── Generate diff images ──────────────────────────────────────────────────
    const { diffImage, overlayImage } = this.diffGen.generate(raw);

    // ── Build result ──────────────────────────────────────────────────────────
    const { metrics } = raw;
    const status  = raw.match ? 'PASS' : 'FAIL';
    const message = raw.match
      ? `Visual match PASS — ${metrics.diffPercent}% diff (threshold ${threshold}%, mode: ${mode}).`
      : `Visual match FAIL — ${metrics.diffPercent}% pixels differ ` +
        `(${metrics.diffPixels}/${metrics.totalPixels} px, threshold ${threshold}%, mode: ${mode}).`;

    this.logger.info('visual_comparison_complete', {
      key: baselineKey, status, diffPercent: metrics.diffPercent,
    });

    const result: VisualAssertionResult = {
      assertionKind:   'assert_visual_match',
      status,
      expected:        `≤${threshold}% pixel difference`,
      actual:          `${metrics.diffPercent}% (${metrics.diffPixels} px)`,
      message,
      duration_ms:     Date.now() - t0,
      visual:          metrics,
      baselineKey,
      evidenceBaseline: this._makeEvidence('screenshot', baselineBuf,  stepId, startedAt, { role: 'baseline' }),
      evidenceCurrent:  this._makeEvidence('screenshot', currentBuf,   stepId, startedAt, { role: 'current' }),
      evidenceDiff:     this._makeEvidence('screenshot', diffImage,    stepId, startedAt, { role: 'diff' }),
      evidenceOverlay:  this._makeEvidence('screenshot', overlayImage, stepId, startedAt, { role: 'overlay' }),
    };

    return result;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _resolveMode(params: VisualAssertionParams): VisualComparisonMode {
    if (params.mode) return params.mode;
    if (params.ignore_regions?.length) return 'ignore_regions';
    if (params.tolerance !== undefined && params.tolerance > 0)  return 'pixel_tolerance';
    if (params.threshold !== undefined && params.threshold > 0)  return 'percentage_difference';
    return 'exact';
  }

  private _resolveIgnoreRegions(params: VisualAssertionParams): IgnoreRegion[] {
    return params.ignore_regions ?? [];
  }

  private _readDims(buf: Buffer): { width: number; height: number } {
    try {
      const png = PNG.sync.read(buf);
      return { width: png.width, height: png.height };
    } catch {
      return { width: 0, height: 0 };
    }
  }

  private _makeEvidence(
    type:      'screenshot',
    data:      Buffer,
    stepId:    string,
    capturedAt: string,
    metadata?: Record<string, unknown>,
  ): AssertionEvidence {
    return { type, data, capturedAt, stepId, metadata };
  }
}
