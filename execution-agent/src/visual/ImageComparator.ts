// ─── Image Comparator (Phase 4 M5) ────────────────────────────────────────────
// Deterministic pixel-level comparison using pixelmatch + pngjs.
// No AI. Pure pixel math.

import { PNG }       from 'pngjs';
import pixelmatch    from 'pixelmatch';
import type {
  BoundingBox,
  IgnoreRegion,
  VisualComparisonMetrics,
  VisualComparisonMode,
} from './VisualTypes.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompareOptions {
  mode:           VisualComparisonMode;
  /** 0–255 per-channel color tolerance (default 0 for exact, 10 for tolerance modes). */
  tolerance?:     number;
  /** % of pixels allowed to differ, 0–100 (default 0 for exact). */
  threshold?:     number;
  ignoreRegions?: IgnoreRegion[];
}

export interface RawComparisonResult {
  match:       boolean;
  metrics:     VisualComparisonMetrics;
  diffData:    Uint8Array;   // raw RGBA diff pixels (same dims as baseline after resize)
  baselinePng: PNG;
  currentPng:  PNG;          // may be resized
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decodePng(buf: Buffer): PNG {
  return PNG.sync.read(buf);
}

function encodePng(png: PNG): Buffer {
  return Buffer.from(PNG.sync.write(png));
}

/** Nearest-neighbour resize of src to (targetW × targetH). */
function resizePng(src: PNG, targetW: number, targetH: number): PNG {
  const dst      = new PNG({ width: targetW, height: targetH });
  const scaleX   = src.width  / targetW;
  const scaleY   = src.height / targetH;

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const srcX   = Math.min(Math.floor(x * scaleX), src.width  - 1);
      const srcY   = Math.min(Math.floor(y * scaleY), src.height - 1);
      const srcIdx = (srcY * src.width  + srcX) * 4;
      const dstIdx = (y    * targetW + x)    * 4;
      dst.data[dstIdx]     = src.data[srcIdx];
      dst.data[dstIdx + 1] = src.data[srcIdx + 1];
      dst.data[dstIdx + 2] = src.data[srcIdx + 2];
      dst.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }
  return dst;
}

/** Fill a rectangular region with (r, g, b, a) in-place. */
function fillRegion(png: PNG, region: IgnoreRegion, r = 128, g = 128, b = 128, a = 255): void {
  const x2 = Math.min(region.x + region.width,  png.width);
  const y2 = Math.min(region.y + region.height, png.height);
  for (let y = Math.max(0, region.y); y < y2; y++) {
    for (let x = Math.max(0, region.x); x < x2; x++) {
      const idx    = (y * png.width + x) * 4;
      png.data[idx]     = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
}

/**
 * Find axis-aligned bounding boxes of changed regions by scanning
 * the diff buffer for non-black pixels (pixelmatch marks diffs in red).
 * Returns a single merged bounding box per horizontal strip of diffs to
 * keep the output small and useful.
 */
function extractBoundingBoxes(diffData: Uint8Array, width: number, height: number): BoundingBox[] {
  // Collect all changed pixel coordinates
  const changedX: number[] = [];
  const changedY: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // pixelmatch sets diffColor=[255,0,0] for diff pixels;
      // unchanged pixels get a grey ghost (R≈G≈B≈small), so check R>>G.
      if (diffData[idx] > 200 && diffData[idx + 1] < 50 && diffData[idx + 2] < 50) {
        changedX.push(x);
        changedY.push(y);
      }
    }
  }

  if (changedX.length === 0) return [];

  // Return a single overall bounding box (sufficient for v1)
  const minX = Math.min(...changedX);
  const maxX = Math.max(...changedX);
  const minY = Math.min(...changedY);
  const maxY = Math.max(...changedY);

  return [{
    x:      minX,
    y:      minY,
    width:  maxX - minX + 1,
    height: maxY - minY + 1,
  }];
}

// ─── ImageComparator ─────────────────────────────────────────────────────────

export class ImageComparator {

  /**
   * Compare two PNG buffers using the given options.
   * Returns raw comparison data; callers use DiffGenerator to build images.
   */
  compare(baselineBuf: Buffer, currentBuf: Buffer, opts: CompareOptions): RawComparisonResult {
    const tolerance     = opts.tolerance ?? (opts.mode === 'exact' ? 0 : 10);
    const threshold     = opts.threshold ?? 0;   // % of pixels allowed to differ
    const ignoreRegions = opts.ignoreRegions ?? [];

    let baselinePng = decodePng(baselineBuf);
    let currentPng  = decodePng(currentBuf);

    const origCurrentW = currentPng.width;
    const origCurrentH = currentPng.height;
    let resized        = false;

    // Resolution normalization: resize current to baseline dimensions
    if (
      opts.mode === 'resolution_normalization' ||
      (currentPng.width !== baselinePng.width || currentPng.height !== baselinePng.height)
    ) {
      if (currentPng.width !== baselinePng.width || currentPng.height !== baselinePng.height) {
        currentPng = resizePng(currentPng, baselinePng.width, baselinePng.height);
        resized    = true;
      }
    }

    const { width, height } = baselinePng;
    const totalPixels       = width * height;

    // Apply ignore regions: fill the same grey in both images
    for (const region of ignoreRegions) {
      fillRegion(baselinePng, region);
      fillRegion(currentPng,  region);
    }

    // Run pixelmatch
    const diffData = new Uint8Array(width * height * 4);
    // pixelmatch threshold is a fraction 0–1 representing per-pixel color difference
    const pmThreshold = Math.min(tolerance / 255, 1);

    const diffPixels = pixelmatch(
      baselinePng.data,
      currentPng.data,
      diffData,
      width,
      height,
      { threshold: pmThreshold, includeAA: false, diffColor: [255, 0, 0] },
    );

    const diffPercent    = totalPixels === 0 ? 0 : parseFloat(((diffPixels / totalPixels) * 100).toFixed(4));
    const boundingBoxes  = extractBoundingBoxes(diffData, width, height);
    const match          = diffPercent <= threshold;

    const metrics: VisualComparisonMetrics = {
      mode:            opts.mode,
      diffPixels,
      totalPixels,
      diffPercent,
      threshold,
      tolerance,
      boundingBoxes,
      baselineWidth:   baselinePng.width,
      baselineHeight:  baselinePng.height,
      currentWidth:    origCurrentW,
      currentHeight:   origCurrentH,
      resized,
      ignoredRegions:  ignoreRegions.length,
    };

    return { match, metrics, diffData, baselinePng, currentPng };
  }
}

// ─── Re-export helpers used by DiffGenerator ─────────────────────────────────
export { decodePng, encodePng };
