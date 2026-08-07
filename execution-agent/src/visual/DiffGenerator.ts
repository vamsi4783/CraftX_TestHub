// ─── Diff Generator (Phase 4 M5) ──────────────────────────────────────────────
// Builds diff image and overlay image from raw comparison output.

import { PNG }                     from 'pngjs';
import type { RawComparisonResult } from './ImageComparator.js';
import { encodePng }                from './ImageComparator.js';

export interface DiffImages {
  /** PNG where diff pixels are highlighted red; unchanged pixels are dimmed. */
  diffImage:    Buffer;
  /**
   * PNG showing baseline on the left half and current on the right half,
   * with a 2-pixel red divider, at the baseline resolution.
   */
  overlayImage: Buffer;
}

export class DiffGenerator {

  /**
   * Build diff and overlay images from the raw comparison output.
   * Both images are returned as PNG buffers.
   */
  generate(raw: RawComparisonResult): DiffImages {
    const diffImage    = this._buildDiffImage(raw);
    const overlayImage = this._buildOverlayImage(raw);
    return { diffImage, overlayImage };
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _buildDiffImage(raw: RawComparisonResult): Buffer {
    const { baselinePng, diffData } = raw;
    const { width, height }         = baselinePng;

    const out     = new PNG({ width, height });
    const total   = width * height * 4;

    for (let i = 0; i < total; i += 4) {
      const isDiff = diffData[i] > 0;  // red channel set by pixelmatch

      if (isDiff) {
        out.data[i]     = 255;   // R — red highlight
        out.data[i + 1] = 0;     // G
        out.data[i + 2] = 0;     // B
        out.data[i + 3] = 255;   // A
      } else {
        // Dim the unchanged pixel to 40% opacity on white to make diffs stand out
        const r = baselinePng.data[i];
        const g = baselinePng.data[i + 1];
        const b = baselinePng.data[i + 2];
        out.data[i]     = Math.round(r * 0.4 + 255 * 0.6);
        out.data[i + 1] = Math.round(g * 0.4 + 255 * 0.6);
        out.data[i + 2] = Math.round(b * 0.4 + 255 * 0.6);
        out.data[i + 3] = 255;
      }
    }

    return encodePng(out);
  }

  private _buildOverlayImage(raw: RawComparisonResult): Buffer {
    const { baselinePng, currentPng } = raw;
    const { width, height }           = baselinePng;

    // Side-by-side: [baseline | 2px divider | current]
    const DIVIDER     = 2;
    const outW        = width * 2 + DIVIDER;
    const out         = new PNG({ width: outW, height });

    for (let y = 0; y < height; y++) {
      // Baseline (left half)
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x)    * 4;
        const dstIdx = (y * outW  + x)    * 4;
        out.data[dstIdx]     = baselinePng.data[srcIdx];
        out.data[dstIdx + 1] = baselinePng.data[srcIdx + 1];
        out.data[dstIdx + 2] = baselinePng.data[srcIdx + 2];
        out.data[dstIdx + 3] = baselinePng.data[srcIdx + 3] ?? 255;
      }

      // Divider (red)
      for (let d = 0; d < DIVIDER; d++) {
        const dstIdx = (y * outW + width + d) * 4;
        out.data[dstIdx]     = 220;
        out.data[dstIdx + 1] = 50;
        out.data[dstIdx + 2] = 50;
        out.data[dstIdx + 3] = 255;
      }

      // Current (right half)
      for (let x = 0; x < width; x++) {
        const srcX   = Math.min(x, currentPng.width  - 1);
        const srcY   = Math.min(y, currentPng.height - 1);
        const srcIdx = (srcY * currentPng.width + srcX) * 4;
        const dstIdx = (y * outW + width + DIVIDER + x) * 4;
        out.data[dstIdx]     = currentPng.data[srcIdx];
        out.data[dstIdx + 1] = currentPng.data[srcIdx + 1];
        out.data[dstIdx + 2] = currentPng.data[srcIdx + 2];
        out.data[dstIdx + 3] = currentPng.data[srcIdx + 3] ?? 255;
      }
    }

    return encodePng(out);
  }
}
