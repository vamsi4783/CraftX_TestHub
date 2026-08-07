// ─── ImageComparator Tests ────────────────────────────────────────────────────

import { describe, it, expect } from '@jest/globals';
import { ImageComparator }      from '../../visual/ImageComparator.js';
import {
  solidPng, rectPng,
  WHITE_10x10, BLACK_10x10, RED_10x10, WHITE_20x10,
} from './_pngFixtures.js';

const cmp = new ImageComparator();

// ─── Exact match ───────────────────────────────────────────────────────────────

describe('ImageComparator — exact match', () => {
  it('identical images return 0 diffPixels and match=true', () => {
    const r = cmp.compare(WHITE_10x10(), WHITE_10x10(), { mode: 'exact' });
    expect(r.match).toBe(true);
    expect(r.metrics.diffPixels).toBe(0);
    expect(r.metrics.diffPercent).toBe(0);
  });

  it('completely different images return diffPixels > 0 and match=false', () => {
    const r = cmp.compare(WHITE_10x10(), BLACK_10x10(), { mode: 'exact' });
    expect(r.match).toBe(false);
    expect(r.metrics.diffPixels).toBeGreaterThan(0);
  });

  it('reports correct totalPixels', () => {
    const r = cmp.compare(WHITE_10x10(), WHITE_10x10(), { mode: 'exact' });
    expect(r.metrics.totalPixels).toBe(100);
  });

  it('diffPercent rounds to 4 decimal places', () => {
    const r = cmp.compare(WHITE_10x10(), BLACK_10x10(), { mode: 'exact' });
    const decimals = (r.metrics.diffPercent.toString().split('.')[1] ?? '').length;
    expect(decimals).toBeLessThanOrEqual(4);
  });
});

// ─── Pixel tolerance ───────────────────────────────────────────────────────────

describe('ImageComparator — pixel_tolerance', () => {
  it('slight colour difference within tolerance returns match=true', () => {
    // Almost-white vs white; channel diff ≤ 5
    const almostWhite = solidPng(10, 10, 250, 250, 250);
    const r = cmp.compare(WHITE_10x10(), almostWhite, {
      mode: 'pixel_tolerance', tolerance: 10,
    });
    expect(r.match).toBe(true);
  });

  it('colour difference exceeding tolerance returns match=false', () => {
    const r = cmp.compare(WHITE_10x10(), BLACK_10x10(), {
      mode: 'pixel_tolerance', tolerance: 10,
    });
    expect(r.match).toBe(false);
  });

  it('tolerance=0 behaves like exact', () => {
    const almostWhite = solidPng(10, 10, 254, 254, 254);
    const r = cmp.compare(WHITE_10x10(), almostWhite, {
      mode: 'pixel_tolerance', tolerance: 0,
    });
    expect(r.match).toBe(false);
  });
});

// ─── Percentage difference ─────────────────────────────────────────────────────

describe('ImageComparator — percentage_difference', () => {
  it('diff within threshold returns match=true', () => {
    // 1 red pixel in a 10×10 = 1% difference
    const onePixelOff = rectPng(10, 10, 0, 0, 1, 1, 255, 0, 0);
    const r = cmp.compare(WHITE_10x10(), onePixelOff, {
      mode: 'percentage_difference', tolerance: 0, threshold: 5,
    });
    expect(r.match).toBe(true);
    expect(r.metrics.diffPercent).toBeGreaterThan(0);
  });

  it('diff exceeding threshold returns match=false', () => {
    const r = cmp.compare(WHITE_10x10(), RED_10x10(), {
      mode: 'percentage_difference', tolerance: 0, threshold: 5,
    });
    expect(r.match).toBe(false);
    expect(r.metrics.diffPercent).toBeGreaterThan(5);
  });

  it('threshold=0 means any diff fails', () => {
    const onePixelOff = rectPng(10, 10, 0, 0, 1, 1, 255, 0, 0);
    const r = cmp.compare(WHITE_10x10(), onePixelOff, {
      mode: 'percentage_difference', tolerance: 0, threshold: 0,
    });
    expect(r.match).toBe(false);
  });

  it('100% threshold always passes', () => {
    const r = cmp.compare(WHITE_10x10(), BLACK_10x10(), {
      mode: 'percentage_difference', tolerance: 0, threshold: 100,
    });
    expect(r.match).toBe(true);
  });
});

// ─── Ignore regions ────────────────────────────────────────────────────────────

describe('ImageComparator — ignore_regions', () => {
  it('differences inside ignored region are not counted', () => {
    // Image differs only in top-left 5×5 region
    const withRect = rectPng(10, 10, 0, 0, 5, 5, 255, 0, 0);
    const r = cmp.compare(WHITE_10x10(), withRect, {
      mode:          'ignore_regions',
      tolerance:     0,
      threshold:     0,
      ignoreRegions: [{ x: 0, y: 0, width: 5, height: 5 }],
    });
    expect(r.match).toBe(true);
    expect(r.metrics.ignoredRegions).toBe(1);
  });

  it('differences outside ignored region are still counted', () => {
    // Image differs in bottom-right, but we ignore top-left
    const withRect = rectPng(10, 10, 5, 5, 5, 5, 255, 0, 0);
    const r = cmp.compare(WHITE_10x10(), withRect, {
      mode:          'ignore_regions',
      tolerance:     0,
      threshold:     0,
      ignoreRegions: [{ x: 0, y: 0, width: 5, height: 5 }],
    });
    expect(r.match).toBe(false);
  });

  it('empty ignore_regions list has no effect', () => {
    const r = cmp.compare(WHITE_10x10(), BLACK_10x10(), {
      mode: 'ignore_regions', tolerance: 0, threshold: 0, ignoreRegions: [],
    });
    expect(r.match).toBe(false);
    expect(r.metrics.ignoredRegions).toBe(0);
  });
});

// ─── Resolution normalization ──────────────────────────────────────────────────

describe('ImageComparator — resolution_normalization', () => {
  it('resizes current to baseline dimensions and compares', () => {
    const r = cmp.compare(WHITE_10x10(), WHITE_20x10(), {
      mode: 'resolution_normalization',
    });
    expect(r.metrics.resized).toBe(true);
    expect(r.metrics.currentWidth).toBe(20);
    expect(r.metrics.baselineWidth).toBe(10);
    // Both are white so should match after resize
    expect(r.match).toBe(true);
  });

  it('different content still detected after resize', () => {
    const r = cmp.compare(WHITE_10x10(), solidPng(20, 10, 0, 0, 0), {
      mode: 'resolution_normalization',
    });
    expect(r.metrics.resized).toBe(true);
    expect(r.match).toBe(false);
  });
});

// ─── Auto-resize on dimension mismatch ────────────────────────────────────────

describe('ImageComparator — auto-resize on dimension mismatch', () => {
  it('non-normalization mode still auto-resizes mismatched dimensions', () => {
    const r = cmp.compare(WHITE_10x10(), WHITE_20x10(), {
      mode: 'exact',
    });
    expect(r.metrics.resized).toBe(true);
    expect(r.match).toBe(true);
  });
});

// ─── Bounding boxes ────────────────────────────────────────────────────────────

describe('ImageComparator — bounding boxes', () => {
  it('returns empty array when no diff', () => {
    const r = cmp.compare(WHITE_10x10(), WHITE_10x10(), { mode: 'exact' });
    expect(r.metrics.boundingBoxes).toHaveLength(0);
  });

  it('returns at least one box when there is a diff', () => {
    const r = cmp.compare(WHITE_10x10(), BLACK_10x10(), { mode: 'exact' });
    expect(r.metrics.boundingBoxes.length).toBeGreaterThan(0);
  });

  it('bounding box covers the differing area', () => {
    // Only the top-left 4×4 differs
    const withRect = rectPng(10, 10, 0, 0, 4, 4, 0, 0, 0);
    const r = cmp.compare(WHITE_10x10(), withRect, { mode: 'exact' });
    expect(r.metrics.boundingBoxes.length).toBeGreaterThan(0);
    const box = r.metrics.boundingBoxes[0];
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});
